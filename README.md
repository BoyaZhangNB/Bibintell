# 🦫 Bibintell

> **An AI-powered study focus Chrome extension with a beaver companion who keeps you on track.**

Bibintell is not a site blocker. It's a study buddy. Bibin the beaver lives in your browser, checks in when you start studying, monitors the pages you visit in real time using semantic AI analysis, and gently nudges you back on track when you drift — all through conversation.

---

## 📸 What it does

1. **Opens browser** → Bibin appears and asks if you're ready to study
2. **You say yes** → Enter your subject and how long you want to study
3. **You browse** → Every page you visit is semantically checked against your study topic
4. **You drift** → Bibin pops up with a friendly AI-generated nudge
5. **Session ends** → Everything is logged to Supabase and visible on your stats dashboard

---

## 🏗️ Architecture

```
Chrome Extension  →  FastAPI Backend  →  AI Engine  →  Supabase
```

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Chrome Extension | `bibintell-extension/` | UI, messaging, session lifecycle, timers |
| FastAPI Backend | `ai-conversation/main.py` | API server, routes, Supabase integration |
| AI Engine | `ai_engine/` | Embeddings, similarity, LLM reasoning, drift detection |
| Database | Supabase | Persistent session storage, stats, streaks |

---

## 📁 File Structure

```
Bibintell/
├── ai-conversation/
│   ├── main.py                  — FastAPI server, all API endpoints
│   ├── bibin_model.py           — Bibin chat model (HuggingFace endpoint)
│   └── test_model.py
│
├── ai_engine/
│   ├── relevance_engine.py      — Main pipeline entry point
│   ├── web_bootstrapper.py      — LLM-based topic knowledge seeding
│   ├── embedding_service.py     — Sentence embeddings
│   ├── vector_store.py          — In-memory topic vector store
│   ├── similarity_service.py    — Cosine similarity scoring
│   ├── intent_tracker.py        — Drift detection over time
│   ├── reasoning_agent.py       — LLM final relevance verdict
│   ├── concept_extractor.py     — Key concept extraction
│   ├── rag_retriever.py         — RAG context retrieval
│   └── page_processor.py        — Page content preprocessing
│
├── bibintell-extension/
│   ├── manifest.json
│   ├── background/
│   │   └── background.js        — Service worker: messaging, timers, session lifecycle
│   ├── content/
│   │   └── content.js           — Page scraper: fires checkRelevance on every navigation
│   ├── pet/
│   │   ├── pet-container.js     — Bibin UI: speech bubble, drag/drop, conversation
│   │   ├── animation.js         — Sprite animation: Appearing + Conversation sequences
│   │   └── pet.css
│   ├── popup/
│   │   ├── popup.html/css/js    — Live countdown, session status, summon button
│   ├── stats/
│   │   ├── stats.html/css/js    — Full stats dashboard page
│   ├── debugger/
│   │   ├── debugger.html/css/js — Internal debug console
│   └── bibin_assets/
│       ├── Bibin_BGRemoved.png
│       └── animation/
│           ├── Appearing/       — 3 frames
│           └── Conversation/    — 4 frames
│
└── stats/                       — Standalone stats site
```

---

## 🤖 How the AI Pipeline Works

Every page navigation during an active session triggers this pipeline:

```
1. content.js scrapes title + URL + first 1000 chars of body text
2. Sends checkRelevance → background.js
3. background.js POSTs to /check_relevance
4. web_bootstrapper.py seeds topic knowledge via LLM (first call only)
5. embedding_service.py embeds page content + topic vectors
6. similarity_service.py computes cosine similarity
7. intent_tracker.py logs score, checks for sustained drift (3+ low scores)
8. reasoning_agent.py calls LLM for final verdict + confidence + reason
9. If drift_detected OR relevant === false → background.js sends bibinIntervene
10. pet-container.js shows Bibin with AI-generated nudge message
```

---

## ⏱️ Session Lifecycle

### Starting
- Browser opens → `contentReady` fires → Bibin appears
- User enters subject + duration → `studyActive: true` written to storage
- Background timer starts counting down

### During
- Every page → relevance check runs
- `sessionInterventions`, `sessionDistractionSites`, `sessionTotalPages` tracked live
- Popup shows live countdown

### Ending (3 ways)
| Method | Trigger |
|--------|---------|
| Timer expires | `setTimeout` in background.js fires, Bibin says goodbye |
| Manual | User clicks "End Session" → `forceEndSession` message → background |
| Browser close | `chrome.windows.onRemoved` detects last window closing |

On end → actual duration calculated → `/log-session` called → Supabase stores record.

---

## 🔌 API Endpoints

| Method | Route | Called By | Purpose |
|--------|-------|-----------|---------|
| `POST` | `/chat` | pet-container.js | Bibin conversation replies |
| `POST` | `/check_relevance` | background.js | Page relevance analysis |
| `POST` | `/reset_session` | pet-container.js | Clear vector store + history |
| `POST` | `/log-session` | background.js | Save session to Supabase |
| `GET` | `/user-stats` | popup.js, stats.js | Streak, total mins, top distraction |
| `GET` | `/session-history` | stats.js | All sessions for history table |
| `GET` | `/debug_status` | debugger.js | Similarity scores, drift status |

---

## 🧰 Tech Stack

**Extension**
- Vanilla JS (Manifest V3)
- Chrome APIs: `storage`, `tabs`, `windows`, `runtime`

**Backend**
- Python 3.12, FastAPI, Uvicorn
- OpenAI Python SDK → HuggingFace Inference Endpoint
- Supabase Python client
- Pydantic

**AI / ML**
- HuggingFace Inference Endpoint (OpenAI-compatible)
- Sentence embeddings + cosine similarity
- RAG for topic context
- Sliding window drift detection

**Database**
- Supabase (PostgreSQL)

---

## 🚀 Setup

### Prerequisites
- Python 3.10+
- Google Chrome
- HuggingFace account with an active Inference Endpoint
- Supabase project

### 1. Install dependencies

```bash
git clone https://github.com/your-repo/bibintell
cd bibintell
pip install fastapi uvicorn openai supabase pydantic
```

### 2. Set environment variables

```bash
# Windows
set OPENAI_API_KEY=your_huggingface_token

# Mac/Linux
export OPENAI_API_KEY=your_huggingface_token
```

### 3. Create the Supabase table

```sql
create table dam_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id text,
  session_date date,
  subject text,
  intended_duration_mins int,
  actual_duration_mins int,
  interventions int,
  distraction_sites text[],
  total_pages int,
  relevant_pages int,
  created_at timestamptz default now()
);
```

### 4. Start the server

```bash
cd ai-conversation
uvicorn main:app --reload --port 8000
```

### 5. Load the extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked**
4. Select the `bibintell-extension/` folder

---

## 🔑 Required Manifest Permissions

```json
{
  "permissions": ["storage", "tabs", "windows", "activeTab"],
  "host_permissions": ["http://127.0.0.1:8000/*"]
}
```

---

## ⚠️ Known Limitations

- **Streak logic** counts unique study days, not true consecutive days
- **HuggingFace endpoint** may be paused — Bibin won't intervene during downtime but won't crash
- **Service worker timer** may be terminated by Chrome on very long idle sessions
- **user_id** is hardcoded as `legend_1` — multi-user auth not yet implemented
- **Vector store** is in-memory and resets on server restart
- **Focus %** in stats table always shows 0% — `relevant_pages` tracking needs end-to-end verification

---

## 🧠 Design Decisions

**Why not block sites?**
Blocking creates friction and is trivially bypassed. Bibin's conversational nudge mirrors how a real study buddy would behave.

**Why two-stage relevance (similarity + LLM)?**
Embedding similarity is fast but shallow. The LLM reasoning step provides a semantic verdict with a confidence score and a human-readable reason that powers Bibin's specific message. The similarity score gates whether the expensive LLM call fires at all.

**Why is the timer in background.js?**
Content scripts are destroyed on every navigation. A `setTimeout` in a content script would be cancelled every time you click a link. The service worker persists for the browser session lifetime.

**Why `sender.tab.id` instead of `chrome.tabs.query` for interventions?**
By the time the async AI pipeline finishes, the user may have switched tabs. Using the original sender ID ensures Bibin always appears on the correct tab.

---

*Built with 🦫 by the Bibintell team*