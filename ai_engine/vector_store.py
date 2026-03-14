import numpy as np

class VectorStore:
    def __init__(self, dim=384): 
        self.texts = []
        self.embeddings = []

    def add(self, embedding, text):
        self.embeddings.append(embedding)
        self.texts.append(text)
    
    def search(self, query_embedding, k=3):
        if not self.embeddings:
            return []
            
        q = np.array(query_embedding)
        embs = np.array(self.embeddings)
        
        # Calculate Euclidean (L2) distance using standard linear algebra
        distances = np.linalg.norm(embs - q, axis=1)
        nearest_indices = np.argsort(distances)[:k]

        results = []
        for idx in nearest_indices:
            if 0 <= idx < len(self.texts):
                results.append(self.texts[idx])

        return results
    
vector_store = VectorStore()