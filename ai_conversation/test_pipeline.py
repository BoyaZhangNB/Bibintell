import bibin_model.py

vector_store = MyVectorStore()

bibin = BibinModel(vector_store)

history = []

print(bibin.chat("I'm struggling with derivatives", history))
print(bibin.chat("Can you explain it more simply?", history))