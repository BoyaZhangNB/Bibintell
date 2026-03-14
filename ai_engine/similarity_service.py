import numpy as np

TITLE_SIM_WEIGHT= 0.4 #change
CONTENT_SIM_WEIGHT= 0.6 #change

def cosine_similarity(a,b):
    a=np.array(a)
    b=np.array(b)
    return float(np.dot(a,b)/(np.linalg.norm(a)*np.linalg.norm(b)))

def compute_relevance_score(topic_emb, title_emb, content_emb):
    title_sim= cosine_similarity(topic_emb, title_emb)
    content_sim= cosine_similarity(topic_emb, content_emb)
    score= (TITLE_SIM_WEIGHT*title_sim) + (CONTENT_SIM_WEIGHT*content_sim)
    return {
        "score": score,
        "title_similarity": title_sim,
        "content_similarity": content_sim
    }


