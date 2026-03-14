import faiss
import numpy as np

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
    
vector_store= VectorStore()