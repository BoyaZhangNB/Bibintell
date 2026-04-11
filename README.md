# 🦫 Bibintell

> A context-aware AI study agent that monitors user behavior in real time and intervenes with intelligent, conversational nudges.

Bibintell is not a site blocker — it's a real-time decision system. It continuously evaluates browsing behavior against a user's intent using embeddings + LLM reasoning, and intervenes only when it detects meaningful drift.

---

## 🚀 Why This Project Exists

Most productivity tools rely on hard rules (blocklists, timers) — which are brittle and easy to bypass.

Bibintell explores a different idea:

> **Can we build an AI system that understands intent and gently corrects behavior instead of enforcing it?**

This required solving:

- Real-time semantic understanding of arbitrary web content
- Reliable detection of attention drift (not just tab switching)
- Low-latency decision-making under noisy inputs
- Designing non-intrusive interventions instead of hard constraints

---

## ⚡ Key Features

- Real-time semantic monitoring of every page visited
- Context-aware drift detection (not keyword-based)
- Conversational AI nudges instead of blocking
- Session tracking + analytics dashboard
- Persistent user behavior storage (Supabase)

---

## 🏗️ System Architecture

```
Chrome Extension (TypeScript/JS)
        ↓
FastAPI Backend (Python)
        ↓
AI Decision Engine (Embeddings + LLM)
        ↓
Supabase (Postgres)
```

**Core Idea:** Treat every page visit as a classification + reasoning problem, not a rule match.

---

## 🧠 AI Decision Pipeline

Each navigation triggers a multi-stage evaluation pipeline:

1. **Content Extraction** — Title + URL + page text (~1000 chars)
2. **Semantic Encoding** — Sentence embeddings for page + study topic
3. **Fast Filtering** — Cosine similarity determines rough relevance
4. **Drift Detection** — Sliding window over recent activity (temporal signal)
5. **LLM Reasoning** *(Selective)* — Triggered only when confidence is low. Produces:
   - Relevance verdict
   - Confidence score
   - Natural language explanation
6. **Intervention Decision** — If drift is sustained → trigger AI-generated nudge

---

## 🧩 What Makes This Interesting

### 1. Hybrid AI System (Speed vs. Accuracy)
- Embeddings → fast, cheap
- LLM → slow, accurate
- Combined into a **gated pipeline**

### 2. Stateful Behavior Modeling
- Tracks user intent across time (not just single actions)
- Uses temporal drift detection instead of binary checks

### 3. Edge + Backend Coordination
- **Chrome extension** handles: UI, timers, lifecycle
- **Backend** handles: AI reasoning, persistence

### 4. Production-Oriented Design Choices
- Avoids unnecessary LLM calls (cost + latency control)
- Background service worker ensures persistence across navigation
- Supabase used for session logging, analytics, and future personalization

---

## 🧰 Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend (Extension)** | JavaScript (Manifest V3), Chrome APIs (tabs, storage, runtime) |
| **Backend** | Python, FastAPI, REST APIs + async processing |
| **AI / ML** | Sentence embeddings, cosine similarity, LLM reasoning (HuggingFace), RAG-style topic grounding, sliding window drift detection |
| **Infrastructure** | Supabase (PostgreSQL), lightweight in-memory vector store |

---

## 📊 Example Flow

```
User: "Study Operating Systems for 2 hours"

→ Opens YouTube (OS lecture)   → Relevant        → No action
→ Opens Reddit                 → Slight drift    → Monitored
→ Opens unrelated blog         → Sustained drift →
  Bibin: "Hey, this seems off-topic. Want to get back to OS?"
```

---

## 📈 What I Learned

- Real-world AI systems are mostly about **trade-offs**, not models
- LLMs need guardrails and selective usage to be practical
- Behavior modeling is harder than classification
- UX matters: **how** you intervene is as important as **when**

---

## ⚠️ Known Limitations

- No multi-user authentication yet
- In-memory vector store resets on restart
- LLM dependency can introduce latency
- Drift thresholds require tuning per user

---

## 🔮 Future Improvements

- Personalized embeddings per user
- Reinforcement learning for intervention timing
- Multi-device sync
- Fully persistent vector database
- Better evaluation metrics (precision/recall for drift detection)

---

## 💡 Takeaway

Bibintell is less about productivity and more about building AI systems that **understand intent**, **operate in real time**, and **interact with humans in a natural way**.
