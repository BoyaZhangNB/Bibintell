from sentence_transformers import SentenceTransformer
from .config import EMBEDDING_MODEL

model= SentenceTransformer(EMBEDDING_MODEL)

def embed_text(text: str):
    '''
    This function converts a piece of text into its embedding vector
    '''
    return model.encode(text)
