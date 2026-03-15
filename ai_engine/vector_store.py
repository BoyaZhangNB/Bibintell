try:
    import faiss
except:
    pass
import numpy as np
import platform

class VectorStore:

    def __init__(self, dim=384): #all-MiniLM-L6-v2 has 384 dimensions so we use it here
        self.index= faiss.IndexFlatL2(dim)
        self.texts=[]

    def add(self, embedding, text):
        self.index.add(np.array([embedding]))
        self.texts.append(text)
    
    def search(self, embedding, k=3): #change k as you wish, to find nearest neighbours
        D, I= self.index.search(np.array([embedding]),k)

        results=[]
        for idx in I[0]:
            if idx==-1:
                continue
            if 0<=idx<len(self.texts):
                results.append(self.texts[idx])

        return results
    


class SimpleVectorStore:
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

if platform.system()=="Windows":
    vector_store = VectorStore()
else:
    vector_store = SimpleVectorStore()