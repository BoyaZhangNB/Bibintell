import sys
import os

# Tell Python to look at the parent 'Bibintell' folder
# This ensures it can always find your friend's 'ai_engine' folder.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from bibin_model import BibinModel

# importing the ai engine
from ai_engine.relevance_engine import relevance_engine
from ai_engine.vector_store import vector_store
from ai_engine.intent_tracker import tracker

app = FastAPI()
bibin = BibinModel()

# ... (Keep the rest of your endpoints exactly the same below this line) ...
app = FastAPI()
bibin = BibinModel()

# Allow the extension to talk to the local server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For the hackathon, allow all. Restrict to EXTENSION_ID later.
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- PYDANTIC MODELS (Data Shapes) ---
class TopicRequest(BaseModel):
    topic: str

class PageDataRequest(BaseModel):
    topic: str
    title: str
    content: str
    url: str

# --- below are the ENDPOINTS ---

@app.post("/start-dam-session")
async def start_session(body: TopicRequest):
    """
    Called when the user clicks 'Start' in the extension.
    It clears out the old knowledge base so Bibin doesn't mix up topics.
    """
    # Reset the pure NumPy lists
    vector_store.texts = []
    vector_store.embeddings = [] 
    tracker.similarity_history.clear()
    
    return {
        "status": "success", 
        "message": f"Bibin is gathering logs for: {body.topic}!"
    }

@app.post("/check-page")
async def check_page(body: PageDataRequest):
    """
    Called continuously by the extension as the user browses.
    """
    try:
        # 1. Run the heavy AI Engine logic
        engine_result = relevance_engine(body.topic, body.title, body.content, body.url)
        
        # 2. Handle the "llm_analysis" string if it exists
        # Your reasoning_agent returns a JSON string, so we must parse it into a Python dict
        is_relevant = True 
        if "llm_analysis" in engine_result:
            try:
                analysis_dict = json.loads(engine_result["llm_analysis"])
                is_relevant = analysis_dict.get("relevant", True)
                engine_result["llm_analysis"] = analysis_dict # Replace string with dict
            except json.JSONDecodeError:
                print("Warning: Could not parse LLM analysis JSON.")
        else:
            # If it hit the HIGH or LOW thresholds, it skips the LLM and sets "relevant" directly
            is_relevant = engine_result.get("relevant", True)

        # 3. Trigger Bibin if the user is leaking focus
        bibin_message = None
        if not is_relevant:
            guilt_prompt = (
                f"The user is supposed to be having a Dam Session about '{body.topic}', "
                f"but they are currently looking at a page called '{body.title}'. "
                f"Give them a short, beaver-themed guilt trip to get back to work."
            )
            bibin_message = bibin.chat(guilt_prompt)

        # 4. Return the complete package to the Chrome Extension
        return {
            "status": "focused" if is_relevant else "distracted",
            "bibin_reaction": bibin_message, # Will be null if focused
            "engine_data": engine_result
        }

    except Exception as e:
        print(f"Error in /check-page: {e}")
        raise HTTPException(status_code=500, detail=str(e))