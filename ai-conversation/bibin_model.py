import ollama
class BibinModel:
    def __init__(self, model_name="bibin:latest"):
        self.client = ollama.Client()
        self.model_name = model_name

    def chat(self, context: str) -> str:
        # context: the message from the user or extension
        response = self.client.chat(
            model=self.model_name,
            messages=[{"role": "user", "content": context}]
        )
        return response.get("content", "Bibin is thinking...")