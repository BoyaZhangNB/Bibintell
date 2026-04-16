import os
import time
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
supabase: Optional[Client] = None
supabase_init_error: Optional[str] = None

try:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    supabase_init_error = str(e)
    print(f"[WARN] Supabase init failed: {supabase_init_error}")

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
    history: Optional[List[dict]] = None

class RelevanceRequest(BaseModel):
    topic: str
    title: str
    content: str
    url: str

class NudgeRequest(BaseModel):
    prompt: str

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
    started = time.time()
    print(
        f"[CHAT] received message_len={len(body.message or '')} history_len={len(body.history or [])}",
        flush=True,
    )
    try:
        response = bibin.chat(body.message, body.history)
        print(
            f"[CHAT] success reply_len={len(response or '')} elapsed_ms={int((time.time() - started) * 1000)}",
            flush=True,
        )
        return {"reply": response}
    except Exception as e:
        print(
            f"[CHAT] error elapsed_ms={int((time.time() - started) * 1000)} error={e}",
            flush=True,
        )
        import traceback; traceback.print_exc()
        return {"reply": "Oops, I had a hiccup. Try again!", "error": str(e)}


@app.post("/check_relevance")
async def check_relevance(body: RelevanceRequest):
    # Called by the service worker for each page snapshot while a study session is active.
    started = time.time()
    print(
        f"[CHECK] received topic={body.topic!r} title={body.title[:120]!r} content_len={len(body.content or '')}",
        flush=True,
    )
    try:
        result = analyze_relevance(body.topic, body.title, body.content)
        relevant = result.get("relevant", True)
        reason = result.get("reason", "")

        print(
            f"[CHECK] result relevant={relevant} elapsed_ms={int((time.time() - started) * 1000)} reason={reason[:180]!r}",
            flush=True,
        )

        if relevant is False:
            print(
                "[CHECK] intervention_required=true; service_worker_should_call=/nudge",
                flush=True,
            )

        return {
            "relevant": relevant,
            "reason": reason,
            "drift_detected": False,   # kept for extension compatibility, always False now
            "llm_analysis": result,
        }
    except Exception as e:
        print(
            f"[CHECK] error elapsed_ms={int((time.time() - started) * 1000)} error={e}",
            flush=True,
        )
        import traceback; traceback.print_exc()
        return {
            "relevant": True,
            "reason": "Error during analysis — defaulting to relevant.",
            "drift_detected": False,
            "llm_analysis": None,
            "error": str(e)
        }


@app.post("/nudge")
async def nudge(body: NudgeRequest):
    # Called by the service worker intervention loop (initial + every 10s while off-task).
    started = time.time()
    print("🦫 NUDGE ENDPOINT HIT", flush=True)
    prompt = body.prompt or ""
    print(
        f"[NUDGE] received prompt_len={len(prompt)} preview={prompt[:180]!r}",
        flush=True,
    )
    try:
        nudge_text = bibin.generate_nudge(body.prompt)
        print(
            f"[NUDGE] success nudge_len={len(nudge_text or '')} elapsed_ms={int((time.time() - started) * 1000)} nudge={nudge_text!r}",
            flush=True,
        )
        return {"nudge": nudge_text}
    except Exception as e:
        print(
            f"[NUDGE] error elapsed_ms={int((time.time() - started) * 1000)} error={e}",
            flush=True,
        )
        import traceback; traceback.print_exc()
        return {
            "nudge": "Back to your study topic now. Stay focused.",
            "error": str(e)
        }


@app.post("/reset_session")
async def reset_session():
    return {"status": "session reset"}  # nothing to clear without tracker


@app.get("/debug_status")
async def debug_status():
    return {
        "message": "Drift detection removed — LLM-only mode active.",
        "supabase_connected": supabase is not None,
        "supabase_init_error": supabase_init_error,
    }


@app.post("/log-session")
async def log_session(data: SessionLog):
    """Persist the final session summary used by popup/stats dashboards."""
    if supabase is None:
        return {"status": "error", "message": f"Supabase unavailable: {supabase_init_error or 'init failed'}"}

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
    """Aggregate headline metrics for the popup and stats hero cards."""
    if supabase is None:
        return {"streak": 0, "total_study_mins": 0, "top_distraction": "None", "total_interventions": 0}

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
    """Return all past sessions for the stats history table."""
    if supabase is None:
        return {"sessions": []}

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

# run with uvicorn ai_conversation.main:app --reload from root folder
