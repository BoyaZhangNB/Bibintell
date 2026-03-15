from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from .bibin_model import BibinModel
import sys
import os
sys.path.append(os.path.abspath("."))
from ai_engine.relevance_engine import relevance_engine
from ai_engine.intent_tracker import tracker
from ai_engine.vector_store import vector_store

app = FastAPI()
bibin = BibinModel()

EXTENSION_ID = "idjoaimffdnjooloaejdfekolapfmmdl"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[f"chrome-extension://{EXTENSION_ID}"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[dict]] = []

class RelevanceRequest(BaseModel):
    topic: str
    title: str
    content: str
    url: str

@app.post("/chat")
async def chat(body: ChatRequest):

    response = bibin.chat(body.message, body.history)
    response = 1 // 0
    return {"reply": response}

@app.post("/check_relevance")
async def check_relevance(body: RelevanceRequest):
    result = relevance_engine(body.topic, body.title, body.content, body.url)
    return result

@app.post("/reset_session")
async def reset_session():
    vector_store.texts = []       # probably texts not test
    vector_store.embeddings = []
    tracker.similarity_history.clear()
    return {"status": "session reset"}

@app.get("/debug_status")
async def debug_status():
    """Return debugging information about the current session"""
    similarity_history = list(tracker.similarity_history) if tracker.similarity_history else []

    return {
        "similarity_history": similarity_history,
        "history_length": len(similarity_history),
        "vector_store_size": len(vector_store.texts),
        "drift_detected": tracker.detect_drift() if len(similarity_history) >= 3 else False,
        "recent_average": sum(similarity_history[-3:]) / len(similarity_history[-3:]) if len(similarity_history) >= 3 else None
    }