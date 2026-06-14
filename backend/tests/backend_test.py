"""
LifeOS backend regression tests.
Covers: auth (register/login/me/logout), tasks, events, projects+project tasks,
transactions, budget summary, AI chat streaming, dashboard.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://task-command-49.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@lifeos.app"
DEMO_PASSWORD = "demo1234"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def demo_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["email"] == DEMO_EMAIL
    return s


@pytest.fixture(scope="module")
def new_user_session():
    s = requests.Session()
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!", "name": "Test User"}, timeout=15)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    s.email = email
    return s


# ---------- auth ----------
class TestAuth:
    def test_register_new_user(self):
        s = requests.Session()
        email = f"reg_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!", "name": "Reg"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == email
        assert body["auth_provider"] == "email"
        # cookie set
        assert "access_token" in s.cookies
        # me works
        me = s.get(f"{API}/auth/me", timeout=10)
        assert me.status_code == 200
        assert me.json()["email"] == email

    def test_register_duplicate(self, demo_session):
        r = requests.post(f"{API}/auth/register",
                          json={"email": DEMO_EMAIL, "password": "x", "name": "x"}, timeout=10)
        assert r.status_code == 400

    def test_login_demo(self, demo_session):
        me = demo_session.get(f"{API}/auth/me", timeout=10)
        assert me.status_code == 200
        assert me.json()["email"] == DEMO_EMAIL

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": DEMO_EMAIL, "password": "wrong"}, timeout=10)
        assert r.status_code == 401

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401

    def test_logout(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=10)
        r = s.post(f"{API}/auth/logout", timeout=10)
        assert r.status_code == 200
        me = s.get(f"{API}/auth/me", timeout=10)
        assert me.status_code == 401


# ---------- tasks ----------
class TestTasks:
    def test_task_crud(self, new_user_session):
        s = new_user_session
        # create
        r = s.post(f"{API}/tasks", json={"title": "TEST_task", "priority": "high", "status": "todo"}, timeout=10)
        assert r.status_code == 200
        task = r.json()
        assert task["title"] == "TEST_task"
        assert "id" in task and "_id" not in task
        tid = task["id"]

        # list
        r = s.get(f"{API}/tasks", timeout=10)
        assert r.status_code == 200
        assert any(t["id"] == tid for t in r.json())

        # update -> done
        r = s.put(f"{API}/tasks/{tid}",
                  json={"title": "TEST_task", "priority": "high", "status": "done"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["status"] == "done"

        # delete
        r = s.delete(f"{API}/tasks/{tid}", timeout=10)
        assert r.status_code == 200
        r = s.get(f"{API}/tasks", timeout=10)
        assert not any(t["id"] == tid for t in r.json())


# ---------- events ----------
class TestEvents:
    def test_event_crud(self, new_user_session):
        s = new_user_session
        payload = {"title": "TEST_event", "start": "2026-02-10T10:00:00",
                   "end": "2026-02-10T11:00:00", "color": "#D17A58"}
        r = s.post(f"{API}/events", json=payload, timeout=10)
        assert r.status_code == 200
        ev = r.json()
        eid = ev["id"]
        assert ev["title"] == "TEST_event"

        # update
        payload["title"] = "TEST_event2"
        r = s.put(f"{API}/events/{eid}", json=payload, timeout=10)
        assert r.status_code == 200
        assert r.json()["title"] == "TEST_event2"

        # list
        r = s.get(f"{API}/events", timeout=10)
        assert any(e["id"] == eid for e in r.json())

        # delete
        assert s.delete(f"{API}/events/{eid}", timeout=10).status_code == 200


# ---------- projects ----------
class TestProjects:
    def test_project_with_tasks(self, new_user_session):
        s = new_user_session
        r = s.post(f"{API}/projects", json={"name": "TEST_proj", "color": "#4A7A59"}, timeout=10)
        assert r.status_code == 200
        pid = r.json()["id"]
        assert r.json()["task_count"] == 0

        # add card todo
        r = s.post(f"{API}/projects/{pid}/tasks",
                   json={"title": "TEST_card", "status": "todo"}, timeout=10)
        assert r.status_code == 200
        ctid = r.json()["id"]

        # move to in_progress
        r = s.put(f"{API}/project-tasks/{ctid}",
                  json={"title": "TEST_card", "status": "in_progress"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"

        # list
        r = s.get(f"{API}/projects/{pid}/tasks", timeout=10)
        assert any(t["id"] == ctid for t in r.json())

        # delete card
        assert s.delete(f"{API}/project-tasks/{ctid}", timeout=10).status_code == 200

        # delete project
        assert s.delete(f"{API}/projects/{pid}", timeout=10).status_code == 200


# ---------- transactions + budget ----------
class TestBudget:
    def test_transactions_and_summary(self, new_user_session):
        s = new_user_session
        # income
        r = s.post(f"{API}/transactions",
                   json={"type": "income", "amount": 2000.0, "category": "Salaire",
                         "description": "TEST", "date": "2026-01-05"}, timeout=10)
        assert r.status_code == 200
        income_id = r.json()["id"]

        # expense
        r = s.post(f"{API}/transactions",
                   json={"type": "expense", "amount": 500.0, "category": "Loyer",
                         "description": "TEST", "date": "2026-01-06"}, timeout=10)
        assert r.status_code == 200
        expense_id = r.json()["id"]

        # summary
        r = s.get(f"{API}/budget/summary", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["total_income"] >= 2000.0
        assert body["total_expense"] >= 500.0
        assert body["balance"] == round(body["total_income"] - body["total_expense"], 2)
        assert any(c["name"] == "Loyer" for c in body["categories"])
        assert isinstance(body["trend"], list)

        # delete one
        assert s.delete(f"{API}/transactions/{expense_id}", timeout=10).status_code == 200
        r = s.get(f"{API}/budget/summary", timeout=10)
        assert r.json()["total_expense"] == 0 or all(
            t["id"] != expense_id for t in s.get(f"{API}/transactions").json()
        )

        # cleanup income
        s.delete(f"{API}/transactions/{income_id}", timeout=10)

    def test_ai_chat_streaming(self, new_user_session):
        s = new_user_session
        # ensure some data exists
        s.post(f"{API}/transactions",
               json={"type": "income", "amount": 1000.0, "category": "Salaire",
                     "description": "TEST", "date": "2026-01-05"}, timeout=10)

        start = time.time()
        with s.post(f"{API}/budget/ai-chat",
                    json={"message": "Donne-moi un conseil rapide en une phrase"},
                    stream=True, timeout=60) as r:
            assert r.status_code == 200
            assert "text/plain" in r.headers.get("content-type", "")
            collected = ""
            for chunk in r.iter_content(chunk_size=None, decode_unicode=True):
                if chunk:
                    collected += chunk
                if time.time() - start > 45:
                    break
        assert len(collected) > 10, f"AI stream too short: {collected!r}"

        # history
        r = s.get(f"{API}/budget/ai-history", timeout=10)
        assert r.status_code == 200
        hist = r.json()
        roles = [m["role"] for m in hist]
        assert "user" in roles
        assert "assistant" in roles


# ---------- dashboard ----------
class TestDashboard:
    def test_dashboard(self, demo_session):
        r = demo_session.get(f"{API}/dashboard", timeout=10)
        assert r.status_code == 200
        body = r.json()
        for k in ["tasks_total", "tasks_done", "tasks_today", "projects_active",
                  "projects_total", "upcoming_events", "balance",
                  "total_income", "total_expense"]:
            assert k in body
