import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from supabase import create_client, Client
from ai_engine.reasoning_agent import analyze_relevance
from ai_conversation.bibin_model import BibinModel

app = FastAPI()
bibin = BibinModel()

# --- SUPABASE SETUP ---
SUPABASE_URL = "https://oithszuedqqxcwfadzgu.supabase.co"
SUPABASE_KEY = "sb_publishable_y6ftzLKBPLConSbVIlnPmg_OpOHhNfx"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

EXTENSION_ID = "idjoaimffdnjooloaejdfekolapfmmdl"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"chrome-extension://{EXTENSION_ID}"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- REQUEST MODELS ---
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
    try:
        response = bibin.chat(body.message)
        return {"reply": response}
    except Exception as e:
        import traceback; traceback.print_exc()
        return {"reply": "Oops, I had a hiccup. Try again!", "error": str(e)}


@app.post("/check_relevance")
async def check_relevance(body: RelevanceRequest):
    try:
        result = analyze_relevance(body.topic, body.title, body.content)
        return {
            "relevant": result.get("relevant", True),
            "reason":   result.get("reason", ""),
            "drift_detected": False,   # kept for extension compatibility, always False now
            "llm_analysis": result,
        }
    except Exception as e:
        import traceback; traceback.print_exc()
        return {
            "relevant": True,
            "reason": "Error during analysis — defaulting to relevant.",
            "drift_detected": False,
            "llm_analysis": None,
            "error": str(e)
        }


@app.post("/reset_session")
async def reset_session():
    return {"status": "session reset"}  # nothing to clear without tracker


@app.get("/debug_status")
async def debug_status():
    return {"message": "Drift detection removed — LLM-only mode active."}


@app.post("/log-session")
async def log_session(data: SessionLog):
    """Saves the completed Dam Session to Supabase."""
    try:
        supabase.table("dam_sessions").insert({
            "user_id":                "legend_1",
            "session_date":           datetime.now().strftime("%Y-%m-%d"),
            "subject":                data.subject,
            "intended_duration_mins": data.intended_duration_mins,
            "actual_duration_mins":   data.actual_duration_mins,
            "interventions":          data.interventions,
            "distraction_sites":      data.distraction_sites,
            "total_pages":            data.total_pages,
            "relevant_pages":         data.relevant_pages,
        }).execute()
        return {"status": "success", "message": "Dam Session logged!"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/user-stats")
async def get_user_stats():
    """Streak, total study time, and top distraction site."""
    try:
        res = supabase.table("dam_sessions").select("*").eq("user_id", "legend_1").execute()
        sessions = res.data
        if not sessions:
            return {"streak": 0, "total_study_mins": 0, "top_distraction": "None", "total_interventions": 0}

        total_mins = sum(s["actual_duration_mins"] for s in sessions)

        all_distractions = []
        for s in sessions:
            all_distractions.extend(s.get("distraction_sites", []))
        top_distraction = max(set(all_distractions), key=all_distractions.count) if all_distractions else "None"

        today = datetime.now().date()
        dates_studied = {datetime.strptime(s["session_date"], "%Y-%m-%d").date() for s in sessions}

        # True consecutive streak
        streak = 0
        check_date = today
        while check_date in dates_studied:
            streak += 1
            check_date -= timedelta(days=1)
        if streak == 0:
            check_date = today - timedelta(days=1)
            while check_date in dates_studied:
                streak += 1
                check_date -= timedelta(days=1)

        return {
            "streak": streak,
            "total_study_mins": total_mins,
            "top_distraction": top_distraction,
            "total_interventions": sum(s["interventions"] for s in sessions)
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/session-history")
async def get_session_history():
    """All past sessions for the stats history table."""
    try:
        res = (
            supabase.table("dam_sessions")
            .select("*")
            .eq("user_id", "legend_1")
            .order("created_at", desc=True)
            .execute()
        )
        return {"sessions": res.data}
    except Exception as e:
        return {"status": "error", "message": str(e)}
