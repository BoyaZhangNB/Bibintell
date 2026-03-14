import ollama

class BibinModel:
    def __init__(self, model_name="bibin:latest"):
        self.client = ollama.Client()
        self.model_name = model_name

    def chat(self, message: str, history: list = []) -> str:
        # Build messages from history + new message
        messages = []
        for entry in history:
            messages.append({
                "role": entry["role"] if entry["role"] != "bibin" else "assistant",
                "content": entry["content"]
            })
        messages.append({"role": "user", "content": message})

        response = self.client.chat(
            model=self.model_name,
            messages=messages
        )
        # Correct path into Ollama's response object
        return response["message"]["content"]