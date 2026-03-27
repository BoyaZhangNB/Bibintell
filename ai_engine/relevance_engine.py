from .embedding_service import embed_text
from .similarity_service import compute_relevance_score
from .intent_tracker import tracker
from .page_processor import process_page
from .reasoning_agent import analyze_relevance
from .config import SIMILARITY_HIGH


def relevance_engine(topic, title, content, url):  
    page = process_page(title, content, url)

    topic_emb = embed_text(topic)
    title_emb = embed_text(page["title"])
    content_emb = embed_text(page["content"])

    sim_data = compute_relevance_score(topic_emb, title_emb, content_emb)
    score = sim_data["score"]

    tracker.add_page(score, page["title"], url, None)  # temp, updated below
    drift = tracker.detect_drift()

    # High similarity — skip LLM entirely, obviously relevant
    if score > SIMILARITY_HIGH:
        tracker.history[-1]["relevant"] = True
        return {
            "relevant": True,
            "similarity_score": score,
            "drift_detected": drift,
            "reason": "High semantic similarity with study topic.",
            "llm_analysis": None,
            "page_title": page["title"],
            "page_url": url
        }

    # Below threshold — call LLM to make the final call
    llm_result = analyze_relevance(topic, page, score)
    relevant = llm_result.get("relevant", False)
    reason = llm_result.get("reason", "No reason provided.")

    tracker.history[-1]["relevant"] = relevant  # update with real verdict

    return {
        "relevant": relevant,
        "similarity_score": score,
        "drift_detected": drift,
        "reason": reason,
        "llm_analysis": llm_result,
        "page_title": page["title"],
        "page_url": url
    }