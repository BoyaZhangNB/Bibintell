import os
from typing import Optional, List, Dict
from openai import OpenAI


class BibinModel:

    def __init__(self, vector_store, model_name: str = "openai/gpt-oss-120b"):
        """
        Bibin AI tutor using RAG (vector store retrieval + LLM).
        """

        self.vector_store = vector_store
        self.model_name = model_name

        self.client = OpenAI(
            api_key=os.getenv("OPENAI_API_KEY", "test"),
            base_url="https://vjioo4r1vyvcozuj.us-east-2.aws.endpoints.huggingface.cloud/v1",
        )

    def retrieve_context(self, query: str, k: int = 3) -> str:
        """
        Retrieve relevant study resources from the vector database.
        """

        try:
            docs = self.vector_store.search(query, k=k)
        except Exception:
            return ""

        if not docs:
            return ""

        chunks = []
        for doc in docs:
            if isinstance(doc, dict) and "content" in doc:
                chunks.append(doc["content"])

        return "\n\n".join(chunks)

    def build_system_prompt(self, context: str) -> str:
        """
        Build the Bibin system prompt with RAG context.
        """

        return f"""
You are Bibin, a cheerful and hardworking beaver who serves as the ultimate study buddy.

Your mission is to help students stay motivated, focused, and excited about their studies.

Personality rules:
• Speak in a friendly, encouraging tone.
• Use playful beaver-themed analogies such as:
  - "chewing through tough logs"
  - "stacking knowledge like logs in a dam"
  - "building a dam of knowledge"
• Celebrate progress and encourage effort.

Rules:
• If the user seems distracted, gently guide them back to studying.

Knowledge rules:
• You may be given study resources retrieved from a knowledge base.
• Do NOT mention the retrieval system, vector database, or internal tools.

Retrieved Study Resources:
{context}



GIVE ONLY LIKE SHORT SENTENCE AROUND 15 WORDS.
"""

    def chat(self, message: str, history: Optional[List[Dict]] = None) -> str:
        """
        Send a message to Bibin and receive a response.
        """

        history = history or []

        # Retrieve RAG context
        context = self.retrieve_context(message)

        # Build system prompt
        system_prompt = self.build_system_prompt(context)

        messages = [{"role": "system", "content": system_prompt}]

        # Add conversation history
        for entry in history:
            if "role" in entry and "content" in entry:
                messages.append({
                    "role": entry["role"],
                    "content": entry["content"]
                })

        # Add user message
        messages.append({"role": "user", "content": message})

        # Call model
        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            max_tokens=300,
            temperature=0.7,
        )

        reply = response.choices[0].message.content

        # Save to history
        history.append({"role": "assistant", "content": reply})

        return reply