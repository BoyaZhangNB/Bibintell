from .embedding_service import embed_text
from .vector_store import vector_store

def retrieve_concepts(text):
    emb= embed_text(text)

    results=vector_store.search(emb, k=3)

    return results