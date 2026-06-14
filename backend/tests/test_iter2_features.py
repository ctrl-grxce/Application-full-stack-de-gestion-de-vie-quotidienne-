"""
Iteration 2 backend tests:
- Budgets (envelopes) CRUD + allocation endpoint reflects spending
- Goals CRUD + contribute (positive + negative clamp)
- Projects due_date persisted
- Project tasks subtasks persisted
- AI context still streams
"""
import os
import uuid
import time
from datetime import datetime, timezone
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    email = f"iter2_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/auth/register",
               json={"email": email, "password": "Pass1234!", "name": "Iter2"}, timeout=15)
    assert r.status_code == 200
    return s


# ---------- Budgets / Allocation ----------
class TestBudgets:
    def test_budget_crud_and_allocation(self, session):
        s = session
        month = datetime.now(timezone.utc).date().isoformat()[:7]
        date_in_month = f"{month}-15"

        # create envelope
        r = s.post(f"{API}/budgets", json={"category": "Loyer", "limit": 800.0}, timeout=10)
        assert r.status_code == 200, r.text
        env = r.json()
        assert env["category"] == "Loyer"
        assert env["limit"] == 800.0
        assert "id" in env
        bid = env["id"]

        # idempotent post (same category) updates limit
        r = s.post(f"{API}/budgets", json={"category": "Loyer", "limit": 900.0}, timeout=10)
        assert r.status_code == 200
        assert r.json()["limit"] == 900.0
        assert r.json()["id"] == bid  # same record

        # list
        r = s.get(f"{API}/budgets", timeout=10)
        assert r.status_code == 200
        assert any(b["id"] == bid for b in r.json())

        # add income + expense in the current month
        r = s.post(f"{API}/transactions",
                   json={"type": "income", "amount": 3000.0, "category": "Salaire",
                         "description": "TEST", "date": date_in_month}, timeout=10)
        assert r.status_code == 200
        inc_id = r.json()["id"]

        r = s.post(f"{API}/transactions",
                   json={"type": "expense", "amount": 600.0, "category": "Loyer",
                         "description": "TEST", "date": date_in_month}, timeout=10)
        assert r.status_code == 200
        exp_id = r.json()["id"]

        # allocation should reflect spent vs limit
        r = s.get(f"{API}/budget/allocation", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["month"] == month
        assert body["income_month"] >= 3000.0
        assert body["total_limit"] >= 900.0
        item = next((i for i in body["items"] if i["id"] == bid), None)
        assert item is not None
        assert item["spent"] == 600.0
        assert item["limit"] == 900.0
        assert item["remaining"] == 300.0
        assert item["pct"] == round(600 / 900 * 100, 1)

        # update via PUT
        r = s.put(f"{API}/budgets/{bid}", json={"category": "Loyer", "limit": 1000.0}, timeout=10)
        assert r.status_code == 200
        assert r.json()["limit"] == 1000.0

        # add an expense in a non-budgeted category -> should land in unbudgeted
        r = s.post(f"{API}/transactions",
                   json={"type": "expense", "amount": 50.0, "category": "Café",
                         "description": "TEST", "date": date_in_month}, timeout=10)
        assert r.status_code == 200
        cafe_id = r.json()["id"]

        r = s.get(f"{API}/budget/allocation", timeout=10)
        ub = r.json()["unbudgeted"]
        assert any(u["category"] == "Café" and u["spent"] == 50.0 for u in ub)

        # delete envelope
        r = s.delete(f"{API}/budgets/{bid}", timeout=10)
        assert r.status_code == 200
        r = s.get(f"{API}/budgets", timeout=10)
        assert not any(b["id"] == bid for b in r.json())

        # cleanup transactions
        for tid in (inc_id, exp_id, cafe_id):
            s.delete(f"{API}/transactions/{tid}", timeout=10)


# ---------- Goals ----------
class TestGoals:
    def test_goal_crud_and_contribute(self, session):
        s = session
        r = s.post(f"{API}/goals",
                   json={"name": "TEST_voyage", "target": 1000.0, "deadline": "2026-12-31",
                         "color": "#D17A58", "current": 0.0}, timeout=10)
        assert r.status_code == 200
        goal = r.json()
        assert goal["name"] == "TEST_voyage"
        assert goal["target"] == 1000.0
        assert goal["current"] == 0.0
        gid = goal["id"]

        # contribute +200
        r = s.post(f"{API}/goals/{gid}/contribute", json={"amount": 200.0}, timeout=10)
        assert r.status_code == 200
        assert r.json()["current"] == 200.0

        # contribute +50 again -> 250
        r = s.post(f"{API}/goals/{gid}/contribute", json={"amount": 50.0}, timeout=10)
        assert r.json()["current"] == 250.0

        # withdraw -100 -> 150
        r = s.post(f"{API}/goals/{gid}/contribute", json={"amount": -100.0}, timeout=10)
        assert r.json()["current"] == 150.0

        # withdraw too much -> clamps to 0
        r = s.post(f"{API}/goals/{gid}/contribute", json={"amount": -9999.0}, timeout=10)
        assert r.json()["current"] == 0.0

        # update
        r = s.put(f"{API}/goals/{gid}",
                  json={"name": "TEST_voyage_v2", "target": 1500.0, "current": 100.0,
                        "deadline": "2026-12-31", "color": "#4A7A59"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_voyage_v2"
        assert r.json()["target"] == 1500.0
        assert r.json()["current"] == 100.0

        # list
        r = s.get(f"{API}/goals", timeout=10)
        assert any(g["id"] == gid for g in r.json())

        # delete
        r = s.delete(f"{API}/goals/{gid}", timeout=10)
        assert r.status_code == 200
        r = s.get(f"{API}/goals", timeout=10)
        assert not any(g["id"] == gid for g in r.json())

    def test_contribute_nonexistent_404(self, session):
        r = session.post(f"{API}/goals/does-not-exist/contribute",
                         json={"amount": 10}, timeout=10)
        assert r.status_code == 404


# ---------- Projects: due_date + subtasks ----------
class TestProjectExtras:
    def test_project_due_date_and_subtasks(self, session):
        s = session
        # project with due_date
        r = s.post(f"{API}/projects",
                   json={"name": "TEST_proj_due", "color": "#4A7A59",
                         "due_date": "2026-06-30", "status": "active"}, timeout=10)
        assert r.status_code == 200
        proj = r.json()
        assert proj["due_date"] == "2026-06-30"
        pid = proj["id"]

        # card with subtasks
        sub1 = {"id": uuid.uuid4().hex, "title": "step1", "done": False}
        sub2 = {"id": uuid.uuid4().hex, "title": "step2", "done": False}
        r = s.post(f"{API}/projects/{pid}/tasks",
                   json={"title": "TEST_card", "status": "todo",
                         "subtasks": [sub1, sub2]}, timeout=10)
        assert r.status_code == 200
        card = r.json()
        assert len(card["subtasks"]) == 2
        ctid = card["id"]

        # toggle one subtask done via PUT
        sub1["done"] = True
        r = s.put(f"{API}/project-tasks/{ctid}",
                  json={"title": "TEST_card", "status": "todo",
                        "subtasks": [sub1, sub2]}, timeout=10)
        assert r.status_code == 200
        body = r.json()
        done_flags = {st["id"]: st["done"] for st in body["subtasks"]}
        assert done_flags[sub1["id"]] is True
        assert done_flags[sub2["id"]] is False

        # move card across columns (kanban via PUT)
        r = s.put(f"{API}/project-tasks/{ctid}",
                  json={"title": "TEST_card", "status": "in_progress",
                        "subtasks": [sub1, sub2]}, timeout=10)
        assert r.json()["status"] == "in_progress"

        # cleanup
        s.delete(f"{API}/project-tasks/{ctid}", timeout=10)
        s.delete(f"{API}/projects/{pid}", timeout=10)


# ---------- AI context still works with new envelopes/goals ----------
class TestAIContextWithEnvelopes:
    def test_ai_stream_runs(self, session):
        s = session
        # add a budget envelope + goal so context references them
        s.post(f"{API}/budgets", json={"category": "Loyer", "limit": 800.0}, timeout=10)
        g = s.post(f"{API}/goals",
                   json={"name": "TEST_ai_goal", "target": 500.0,
                         "current": 100.0, "color": "#4A7A59"}, timeout=10).json()
        start = time.time()
        with s.post(f"{API}/budget/ai-chat",
                    json={"message": "Une phrase sur mon enveloppe Loyer."},
                    stream=True, timeout=60) as r:
            assert r.status_code == 200
            collected = ""
            for chunk in r.iter_content(chunk_size=None, decode_unicode=True):
                if chunk:
                    collected += chunk
                if time.time() - start > 45:
                    break
        assert len(collected) > 10
        # cleanup goal
        s.delete(f"{API}/goals/{g['id']}", timeout=10)
