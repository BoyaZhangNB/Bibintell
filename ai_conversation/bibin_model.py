import os
from typing import Optional, List, Dict
from openai import OpenAI
from ai_engine.intent_tracker import tracker  # use the existing global tracker
from groq import Groq



class BibinModel:

    def __init__(self, model_name: str = "openai/gpt-oss-120b"):
        """
        Bibin AI tutor using LLM and recent page history from tracker.
        """
        self.model_name = model_name

        self.client = Groq()

    def build_system_prompt(self, page_history: List[Dict]) -> str:
        """
        Build the Bibin system prompt using recent page history.
        """

        # Format recent pages nicely
        if page_history:
            history_text = "\n".join([
                f"- {p['title']} ({'relevant' if p['relevant'] else 'irrelevant'}, "
                f"score: {p['similarity']:.2f})"
                for p in page_history
            ])
        else:
            history_text = "No recent pages available."

        return f"""
You are Bibin, a cheerful and hardworking beaver who serves as the ultimate study buddy.

Your mission is to help students stay motivated, focused, and excited about their studies.

Personality rules:
• Speak in a friendly, encouraging tone.
• Use playful beaver-themed analogies such as:
  - "chewing through tough logs"
  - "stacking knowledge like logs in a dam"
  - "building a dam of knowledge"

Rules:
• If the user seems distracted, gently guide them back to studying.
• if you need to send a message try using their page history if some pages in their history is Not relevant by nudging them with something like "Hey, I noticed you were looking at [page title]. How does that relate to your studies?" change it up sometimes

User's Recent Page History:
{history_text}

GIVE ONLY A SHORT RESPONSE, AROUND 15 WORDS.
"""

    def chat(self, message: str, history: Optional[List[Dict]] = None) -> str:
        """
        Send a message to Bibin and receive a response.
        """
        history = history or []

        # Use the tracker history for prompt
        system_prompt = self.build_system_prompt(tracker.history)

        messages = [{"role": "system", "content": system_prompt}]

        # Add conversation history
        for entry in history:
            if "role" in entry and "content" in entry:
                messages.append({
                    "role": entry["role"],
                    "content": entry["content"]
                })

        # Add current user message
        messages.append({"role": "user", "content": message})

        # Call the LLM
        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            max_tokens=300,
            temperature=0.7,
        )

        reply = response.choices[0].message.content

        # Save to conversation history
        history.append({"role": "assistant", "content": reply})

        return reply