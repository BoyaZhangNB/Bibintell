import json
from .embedding_service import embed_text
from .vector_store import vector_store
from .concept_extractor import extract_concepts

def add_page_knowledge(content):
    concepts=extract_concepts(content)

    try:
        concepts=json.loads(concepts)
    except:
        return
    for concept in concepts:
        emb=embed_text(concept)
        vector_store.add(emb,concept)
