from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from bibin_model import BibinModel

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

@app.post("/chat")
async def chat(body: ChatRequest):
    response = bibin.chat(body.message, body.history)
    return {"reply": response}