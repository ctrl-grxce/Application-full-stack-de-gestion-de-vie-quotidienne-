from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import logging
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
import uuid
import bcrypt
import jwt
import secrets
import httpx
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": now_utc() + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookie(response: Response, token: str, key: str = "access_token", max_age: int = 604800):
    response.set_cookie(
        key=key, value=token, httponly=True, secure=True,
        samesite="none", max_age=max_age, path="/",
    )


def clean_user(doc: dict) -> dict:
    return {
        "user_id": doc["user_id"],
        "email": doc["email"],
        "name": doc.get("name", ""),
        "picture": doc.get("picture"),
        "auth_provider": doc.get("auth_provider", "email"),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    session_token = request.cookies.get("session_token")
    if not token and not session_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            session_token = auth_header[7:]

    # 1. Try JWT access token
    if token:
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
            if user:
                return user
        except jwt.PyJWTError:
            pass

    # 2. Try google session token (or bearer)
    if session_token:
        # Maybe it's actually a JWT passed via bearer
        try:
            payload = jwt.decode(session_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
            if user:
                return user
        except jwt.PyJWTError:
            pass
        sess = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
        if sess:
            expires_at = sess["expires_at"]
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at >= now_utc():
                user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
                if user:
                    return user

    raise HTTPException(status_code=401, detail="Not authenticated")


# ---------------------------------------------------------------------------
# Auth Models
# ---------------------------------------------------------------------------
class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginInput(BaseModel):
    email: EmailStr
    password: str


# ---------------------------------------------------------------------------
# Auth Endpoints
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(input: RegisterInput, response: Response):
    email = input.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Un compte existe déjà avec cet email")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": email,
        "name": input.name.strip(),
        "password_hash": hash_password(input.password),
        "auth_provider": "email",
        "picture": None,
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id, email)
    set_auth_cookie(response, token)
    return clean_user(doc)


@api_router.post("/auth/login")
async def login(input: LoginInput, response: Response):
    email = input.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(input.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    token = create_access_token(user["user_id"], email)
    set_auth_cookie(response, token)
    return clean_user(user)


@api_router.post("/auth/session")
async def google_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id manquant")
    async with httpx.AsyncClient() as hc:
        r = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Session Google invalide")
        data = r.json()

    email = data["email"].lower()
    user = await db.users.find_one({"email": email})
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name", ""),
            "password_hash": None,
            "auth_provider": "google",
            "picture": data.get("picture"),
            "created_at": now_utc().isoformat(),
        }
        await db.users.insert_one(user)
    else:
        await db.users.update_one(
            {"email": email},
            {"$set": {"picture": data.get("picture"), "auth_provider": user.get("auth_provider", "google")}},
        )

    session_token = data["session_token"]
    await db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": session_token,
        "expires_at": (now_utc() + timedelta(days=7)).isoformat(),
        "created_at": now_utc().isoformat(),
    })
    set_auth_cookie(response, session_token, key="session_token")
    return clean_user(user)


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return clean_user(user)


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Generic models
# ---------------------------------------------------------------------------
class TaskInput(BaseModel):
    title: str
    notes: Optional[str] = ""
    status: Literal["todo", "in_progress", "done"] = "todo"
    priority: Literal["low", "medium", "high"] = "medium"
    due_date: Optional[str] = None
    tags: List[str] = []


class EventInput(BaseModel):
    title: str
    description: Optional[str] = ""
    start: str
    end: str
    color: str = "#D17A58"
    all_day: bool = False


class ProjectInput(BaseModel):
    name: str
    description: Optional[str] = ""
    color: str = "#4A7A59"
    status: Literal["active", "on_hold", "completed"] = "active"


class ProjectTaskInput(BaseModel):
    title: str
    description: Optional[str] = ""
    status: Literal["todo", "in_progress", "review", "done"] = "todo"
    priority: Literal["low", "medium", "high"] = "medium"
    due_date: Optional[str] = None


class TransactionInput(BaseModel):
    type: Literal["income", "expense"]
    amount: float
    category: str
    description: Optional[str] = ""
    date: str


class AIChatInput(BaseModel):
    message: str


def new_id() -> str:
    return uuid.uuid4().hex


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------
@api_router.get("/tasks")
async def list_tasks(user: dict = Depends(get_current_user)):
    items = await db.tasks.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api_router.post("/tasks")
async def create_task(input: TaskInput, user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": user["user_id"], **input.model_dump(), "created_at": now_utc().isoformat()}
    await db.tasks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, input: TaskInput, user: dict = Depends(get_current_user)):
    res = await db.tasks.update_one({"id": task_id, "user_id": user["user_id"]}, {"$set": input.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tâche introuvable")
    doc = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return doc


@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    await db.tasks.delete_one({"id": task_id, "user_id": user["user_id"]})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Events (calendar)
# ---------------------------------------------------------------------------
@api_router.get("/events")
async def list_events(user: dict = Depends(get_current_user)):
    items = await db.events.find({"user_id": user["user_id"]}, {"_id": 0}).sort("start", 1).to_list(2000)
    return items


@api_router.post("/events")
async def create_event(input: EventInput, user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": user["user_id"], **input.model_dump(), "created_at": now_utc().isoformat()}
    await db.events.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/events/{event_id}")
async def update_event(event_id: str, input: EventInput, user: dict = Depends(get_current_user)):
    res = await db.events.update_one({"id": event_id, "user_id": user["user_id"]}, {"$set": input.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    doc = await db.events.find_one({"id": event_id}, {"_id": 0})
    return doc


@api_router.delete("/events/{event_id}")
async def delete_event(event_id: str, user: dict = Depends(get_current_user)):
    await db.events.delete_one({"id": event_id, "user_id": user["user_id"]})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------
@api_router.get("/projects")
async def list_projects(user: dict = Depends(get_current_user)):
    projects = await db.projects.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for p in projects:
        tasks = await db.project_tasks.find({"project_id": p["id"]}, {"_id": 0}).to_list(1000)
        p["task_count"] = len(tasks)
        p["done_count"] = len([t for t in tasks if t["status"] == "done"])
    return projects


@api_router.post("/projects")
async def create_project(input: ProjectInput, user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": user["user_id"], **input.model_dump(), "created_at": now_utc().isoformat()}
    await db.projects.insert_one(doc)
    doc.pop("_id", None)
    doc["task_count"] = 0
    doc["done_count"] = 0
    return doc


@api_router.put("/projects/{project_id}")
async def update_project(project_id: str, input: ProjectInput, user: dict = Depends(get_current_user)):
    res = await db.projects.update_one({"id": project_id, "user_id": user["user_id"]}, {"$set": input.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    doc = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return doc


@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    await db.projects.delete_one({"id": project_id, "user_id": user["user_id"]})
    await db.project_tasks.delete_many({"project_id": project_id})
    return {"ok": True}


@api_router.get("/projects/{project_id}/tasks")
async def list_project_tasks(project_id: str, user: dict = Depends(get_current_user)):
    items = await db.project_tasks.find({"project_id": project_id, "user_id": user["user_id"]}, {"_id": 0}).to_list(2000)
    return items


@api_router.post("/projects/{project_id}/tasks")
async def create_project_task(project_id: str, input: ProjectTaskInput, user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": user["user_id"], "project_id": project_id, **input.model_dump(), "created_at": now_utc().isoformat()}
    await db.project_tasks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/project-tasks/{task_id}")
async def update_project_task(task_id: str, input: ProjectTaskInput, user: dict = Depends(get_current_user)):
    res = await db.project_tasks.update_one({"id": task_id, "user_id": user["user_id"]}, {"$set": input.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tâche introuvable")
    doc = await db.project_tasks.find_one({"id": task_id}, {"_id": 0})
    return doc


@api_router.delete("/project-tasks/{task_id}")
async def delete_project_task(task_id: str, user: dict = Depends(get_current_user)):
    await db.project_tasks.delete_one({"id": task_id, "user_id": user["user_id"]})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Budget
# ---------------------------------------------------------------------------
@api_router.get("/transactions")
async def list_transactions(user: dict = Depends(get_current_user)):
    items = await db.transactions.find({"user_id": user["user_id"]}, {"_id": 0}).sort("date", -1).to_list(5000)
    return items


@api_router.post("/transactions")
async def create_transaction(input: TransactionInput, user: dict = Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": user["user_id"], **input.model_dump(), "created_at": now_utc().isoformat()}
    await db.transactions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/transactions/{tx_id}")
async def update_transaction(tx_id: str, input: TransactionInput, user: dict = Depends(get_current_user)):
    res = await db.transactions.update_one({"id": tx_id, "user_id": user["user_id"]}, {"$set": input.model_dump()})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transaction introuvable")
    doc = await db.transactions.find_one({"id": tx_id}, {"_id": 0})
    return doc


@api_router.delete("/transactions/{tx_id}")
async def delete_transaction(tx_id: str, user: dict = Depends(get_current_user)):
    await db.transactions.delete_one({"id": tx_id, "user_id": user["user_id"]})
    return {"ok": True}


@api_router.get("/budget/summary")
async def budget_summary(user: dict = Depends(get_current_user)):
    txs = await db.transactions.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(5000)
    total_income = sum(t["amount"] for t in txs if t["type"] == "income")
    total_expense = sum(t["amount"] for t in txs if t["type"] == "expense")
    balance = total_income - total_expense

    by_category = defaultdict(float)
    for t in txs:
        if t["type"] == "expense":
            by_category[t["category"]] += t["amount"]
    categories = [{"name": k, "value": round(v, 2)} for k, v in sorted(by_category.items(), key=lambda x: -x[1])]

    monthly = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    for t in txs:
        month = (t.get("date") or "")[:7]
        if month:
            monthly[month][t["type"]] += t["amount"]
    trend = [
        {"month": m, "income": round(v["income"], 2), "expense": round(v["expense"], 2),
         "net": round(v["income"] - v["expense"], 2)}
        for m, v in sorted(monthly.items())
    ]

    return {
        "total_income": round(total_income, 2),
        "total_expense": round(total_expense, 2),
        "balance": round(balance, 2),
        "categories": categories,
        "trend": trend,
        "transaction_count": len(txs),
    }


async def build_budget_context(user_id: str) -> str:
    txs = await db.transactions.find({"user_id": user_id}, {"_id": 0}).to_list(5000)
    total_income = sum(t["amount"] for t in txs if t["type"] == "income")
    total_expense = sum(t["amount"] for t in txs if t["type"] == "expense")
    by_category = defaultdict(float)
    for t in txs:
        if t["type"] == "expense":
            by_category[t["category"]] += t["amount"]
    cat_str = ", ".join(f"{k}: {round(v, 2)}€" for k, v in sorted(by_category.items(), key=lambda x: -x[1])) or "aucune"
    monthly = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    for t in txs:
        month = (t.get("date") or "")[:7]
        if month:
            monthly[month][t["type"]] += t["amount"]
    trend_str = "; ".join(
        f"{m}: revenus {round(v['income'], 2)}€ / dépenses {round(v['expense'], 2)}€"
        for m, v in sorted(monthly.items())
    ) or "aucun historique"
    return (
        f"Données financières de l'utilisateur (devise: EUR €):\n"
        f"- Revenus totaux: {round(total_income, 2)}€\n"
        f"- Dépenses totales: {round(total_expense, 2)}€\n"
        f"- Solde actuel: {round(total_income - total_expense, 2)}€\n"
        f"- Nombre de transactions: {len(txs)}\n"
        f"- Dépenses par catégorie: {cat_str}\n"
        f"- Évolution mensuelle: {trend_str}\n"
    )


@api_router.get("/budget/ai-history")
async def ai_history(user: dict = Depends(get_current_user)):
    items = await db.ai_chats.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return items


@api_router.post("/budget/ai-chat")
async def ai_chat(input: AIChatInput, user: dict = Depends(get_current_user)):
    user_id = user["user_id"]
    context = await build_budget_context(user_id)
    await db.ai_chats.insert_one({
        "id": new_id(), "user_id": user_id, "role": "user",
        "content": input.message, "created_at": now_utc().isoformat(),
    })

    system_message = (
        "Tu es un conseiller financier IA expert et bienveillant intégré dans l'application LifeOS. "
        "Tu aides l'utilisateur à comprendre, prédire et optimiser son budget personnel. "
        "Réponds toujours en français, de manière claire, concise et actionnable. "
        "Utilise les données financières fournies pour donner des conseils personnalisés, "
        "des prédictions sur les tendances futures, et des recommandations concrètes d'épargne. "
        "Formate ta réponse avec des paragraphes courts. La devise est l'euro (€).\n\n" + context
    )

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"budget_{user_id}",
        system_message=system_message,
    ).with_model("anthropic", "claude-sonnet-4-6")

    async def event_generator():
        full = ""
        try:
            async for event in chat.stream_message(UserMessage(text=input.message)):
                if isinstance(event, TextDelta):
                    full += event.content
                    yield event.content
                elif isinstance(event, StreamDone):
                    break
        except Exception as e:
            logger.error(f"AI error: {e}")
            yield "\n[Erreur de génération. Réessayez.]"
        finally:
            if full:
                await db.ai_chats.insert_one({
                    "id": new_id(), "user_id": user_id, "role": "assistant",
                    "content": full, "created_at": now_utc().isoformat(),
                })

    return StreamingResponse(
        event_generator(),
        media_type="text/plain",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@api_router.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    uid = user["user_id"]
    tasks = await db.tasks.find({"user_id": uid}, {"_id": 0}).to_list(1000)
    events = await db.events.find({"user_id": uid}, {"_id": 0}).sort("start", 1).to_list(1000)
    projects = await db.projects.find({"user_id": uid}, {"_id": 0}).to_list(500)
    txs = await db.transactions.find({"user_id": uid}, {"_id": 0}).to_list(5000)

    today = now_utc().date().isoformat()
    upcoming = [e for e in events if (e.get("start") or "")[:10] >= today][:5]
    total_income = sum(t["amount"] for t in txs if t["type"] == "income")
    total_expense = sum(t["amount"] for t in txs if t["type"] == "expense")

    return {
        "tasks_total": len(tasks),
        "tasks_done": len([t for t in tasks if t["status"] == "done"]),
        "tasks_today": [t for t in tasks if t.get("due_date") == today and t["status"] != "done"][:5],
        "projects_active": len([p for p in projects if p["status"] == "active"]),
        "projects_total": len(projects),
        "upcoming_events": upcoming,
        "balance": round(total_income - total_expense, 2),
        "total_income": round(total_income, 2),
        "total_expense": round(total_expense, 2),
    }


@api_router.get("/")
async def root():
    return {"message": "LifeOS API"}


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id")
    await db.user_sessions.create_index("session_token")
    for coll in ["tasks", "events", "projects", "project_tasks", "transactions"]:
        await db[coll].create_index("user_id")

    admin_email = os.environ.get("ADMIN_EMAIL", "demo@lifeos.app").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "demo1234")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": admin_email,
            "name": "Demo",
            "password_hash": hash_password(admin_password),
            "auth_provider": "email",
            "picture": None,
            "created_at": now_utc().isoformat(),
        })
    elif existing.get("password_hash") and not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
