import os
from typing import Optional, List, Dict
from groq import Groq


class BibinModel:

    def __init__(self, model_name: str = "llama-3.3-70b-versatile"):
        self.model_name = model_name
        self.client = Groq()  # reads GROQ_API_KEY from environment

    def build_system_prompt(self) -> str:
        return """You are Bibin, a cheerful and hardworking beaver who serves as the ultimate study buddy.

Your mission is to help students stay motivated, focused, and excited about their studies.

Personality rules:
• Speak in a friendly, encouraging tone.
• Use playful beaver-themed analogies such as:
  - "chewing through tough logs"
  - "stacking knowledge like logs in a dam"
  - "building a dam of knowledge"

Rules:
• If the user seems distracted, gently guide them back to studying.
• Keep responses short and positive.

GIVE ONLY A SHORT RESPONSE, AROUND 15 WORDS."""

    def chat(self, message: str, history: Optional[List[Dict]] = None) -> str:
        history = history or []

        messages = [{"role": "system", "content": self.build_system_prompt()}]

        # Add conversation history (roles must be "user" or "assistant")
        for entry in history:
            if entry.get("role") in ("user", "assistant") and "content" in entry:
                messages.append({"role": entry["role"], "content": entry["content"]})

        messages.append({"role": "user", "content": message})

        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            max_tokens=150,
            temperature=0.7,
        )

        reply = response.choices[0].message.content
        history.append({"role": "assistant", "content": reply})
        return reply