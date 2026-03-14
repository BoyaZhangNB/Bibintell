from .embedding_service import embed_text
from .similarity_service import compute_relevance_score
from .intent_tracker import tracker
from .page_processor import process_page
from .rag_retriever import retrieve_concepts
from .reasoning_agent import analyze_relevance
from .config import SIMILARITY_HIGH, SIMILARITY_LOW
from .knowledge_builder import add_page_knowledge
from .web_bootstrapper import bootstrap_topic
from .vector_store import vector_store

def relevance_engine(topic, title, content, url):
    if len(vector_store.texts) == 0:
        bootstrap_topic(topic)
        
    page= process_page(title, content, url)

    topic_emb=embed_text(topic)
    title_emb=embed_text(page["title"])
    content_emb= embed_text(page["content"])

    sim_data= compute_relevance_score(topic_emb, title_emb, content_emb)

    score= sim_data["score"]

    tracker.add_similarity(score)

    drift= tracker.detect_drift()

    if score>SIMILARITY_HIGH:
        add_page_knowledge(page["content"])
        return {
            "relevant": True,
            "confidence": score,
            "reason": "High semantic similarity with study topic."
        }
    if score<SIMILARITY_LOW:
        return {
            "relevant": False,
            "confidence": 1 - score,
            "reason": "Low similarity to study topic."
        }
    concepts= retrieve_concepts(page["content"])

    llm_result= analyze_relevance(topic,page,score, concepts)

    return {
        "similarity_score": score,
        "drift_detected": drift,
        "llm_analysis": llm_result
    }