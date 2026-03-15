from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from contextlib import asynccontextmanager
from .bibin_model import BibinModel
import sys
import os
import subprocess
import time
import httpx
from datetime import datetime, timedelta

sys.path.append(os.path.abspath("."))
from ai_engine.relevance_engine import relevance_engine
from ai_engine.intent_tracker import tracker
from ai_engine.vector_store import vector_store

from supabase import create_client, Client

# --- SUPABASE SETUP ---
SUPABASE_URL = "https://oithszuedqqxcwfadzgu.supabase.co"
SUPABASE_KEY = "sb_publishable_y6ftzLKBPLConSbVIlnPmg_OpOHhNfx"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- OLLAMA AUTO START ---
def start_ollama():
    try:
        response = httpx.get("http://127.0.0.1:11434")
        print("Ollama already running")
    except Exception:
        print("Starting Ollama...")
        subprocess.Popen(
            ["ollama", "serve"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        time.sleep(3)
        print("Ollama started")

@asynccontextmanager
async def lifespan(app: FastAPI):
    start_ollama()
    yield

app = FastAPI(lifespan=lifespan)
bibin = BibinModel()

EXTENSION_ID = "idjoaimffdnjooloaejdfekolapfmmdl"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

# --- MODELS ---
class ChatRequest(BaseModel):
    message: str
    history: Optional[List[dict]] = []

class RelevanceRequest(BaseModel):
    topic: str
    title: str
    content: str
    url: str

class SessionLog(BaseModel):
    subject: str
    intended_duration_mins: int
    actual_duration_mins: int
    interventions: int
    distraction_sites: List[str]
    total_pages: int
    relevant_pages: int

# --- ENDPOINTS ---
@app.post("/chat")
async def chat(body: ChatRequest):
    response = bibin.chat(body.message, body.history)
    return {"reply": response}

@app.post("/check_relevance")
async def check_relevance(body: RelevanceRequest):
    result = relevance_engine(body.topic, body.title, body.content, body.url)
    return result

@app.post("/reset_session")
async def reset_session():
    vector_store.texts = []
    vector_store.embeddings = []
    tracker.similarity_history.clear()
    return {"status": "session reset"}

@app.get("/debug_status")
async def debug_status():
    similarity_history = list(tracker.similarity_history) if tracker.similarity_history else []
    return {
        "similarity_history": similarity_history,
        "history_length": len(similarity_history),
        "vector_store_size": len(vector_store.texts),
        "drift_detected": tracker.detect_drift() if len(similarity_history) >= 3 else False,
        "recent_average": sum(similarity_history[-3:]) / len(similarity_history[-3:]) if len(similarity_history) >= 3 else None
    }

@app.post("/log-session")
async def log_session(data: SessionLog):
    try:
        supabase.table("dam_sessions").insert({
            "user_id": "legend_1",
            "session_date": datetime.now().strftime("%Y-%m-%d"),
            "subject": data.subject,
            "intended_duration_mins": data.intended_duration_mins,
            "actual_duration_mins": data.actual_duration_mins,
            "interventions": data.interventions,
            "distraction_sites": data.distraction_sites,
            "total_pages": data.total_pages,
            "relevant_pages": data.relevant_pages
        }).execute()
        return {"status": "success", "message": "Dam Session logged in Supabase!"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/user-stats")
async def get_user_stats():
    try:
        res = supabase.table("dam_sessions").select("*").eq("user_id", "legend_1").execute()
        sessions = res.data

        if not sessions:
            return {"streak": 0, "total_study_mins": 0, "top_distraction": "None", "total_interventions": 0}

        total_mins = sum(s["actual_duration_mins"] for s in sessions)

        all_distractions = []
        for s in sessions:
            all_distractions.extend(s.get("distraction_sites", []))

        top_distraction = "None"
        if all_distractions:
            top_distraction = max(set(all_distractions), key=all_distractions.count)

        today = datetime.now().date()
        yesterday = today - timedelta(days=1)
        dates_studied = {
            datetime.strptime(s["session_date"], "%Y-%m-%d").date() 
            for s in sessions
        }

        streak = 0
        if today in dates_studied or yesterday in dates_studied:
            streak = len(dates_studied)

        return {
            "streak": streak,
            "total_study_mins": total_mins,
            "top_distraction": top_distraction,
            "total_interventions": sum(s["interventions"] for s in sessions)
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}