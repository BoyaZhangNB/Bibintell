import os
from typing import Optional, List, Dict
from groq import Groq
from dotenv import load_dotenv

load_dotenv()


class BibinModel:

    def __init__(self, model_name: str = "llama-3.3-70b-versatile"):
        self.model_name = model_name
        self.nudge_model_name = "llama-3.3-70b-versatile"
        api_key = os.getenv("GROQ_API_KEY")
        self.client = Groq(api_key=api_key) if api_key else Groq()  # fallback to existing env behavior

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
        if not isinstance(reply, str) or not reply.strip():
            reply = "Let's keep building your study dam. What's the next step?"
        history.append({"role": "assistant", "content": reply})
        return reply

    def generate_nudge(self, prompt: str) -> str:
        print(
            f"[BibinModel.nudge] start model={self.nudge_model_name} prompt_len={len(prompt or '')}",
            flush=True,
        )

        system = """You are Bibin, a beaver study coach with sharp wit and real accountability energy.

Your personality:
- You build dams. You respect focus. You do NOT respect distraction.
- First reminder: funny and surprised, like catching a friend red-handed
- Second/third reminder: disappointed dad energy, still beaver-themed
- Fourth+ reminder: short, stern, no jokes — just facts

Output rules:
- Plain text only, no quotes, no emojis
- Max 2 sentences 40 words
- First sentence is always the witty hook
- Second sentence is the redirect back to studying
- Use beaver/dam wordplay naturally (dam, lodge, current, downstream, chew through, gnaw)
- Never insult the user, never name the exact website
- Always mention the study topic and the irrelevant page by name
- Reference one real metric (focus percent, elapsed time, or intervention count) when available
    """

        try:
            response = self.client.chat.completions.create(
                model=self.nudge_model_name,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=80,
                temperature=1,
            )
        except Exception as e:
            print(f"[BibinModel.nudge] groq_error={e}", flush=True)
            raise

        nudge = response.choices[0].message.content
        print(
            f"[BibinModel.nudge] raw_len={len(nudge or '') if isinstance(nudge, str) else 0} raw_preview={(nudge or '')[:180]!r}",
            flush=True,
        )

        if not isinstance(nudge, str) or not nudge.strip():
            return "Back to your study topic now. Stay focused."

        return nudge.strip()