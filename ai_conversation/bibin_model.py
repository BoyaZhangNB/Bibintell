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
        return """You are Bibin, a beaver who is this student's brutally honest study buddy.

Personality: You use sarcasm as a love language. You genuinely care about their success, which is why you're not going to coddle them. Think: that one friend who won't let you spiral or make excuses, but also celebrates every win like it actually matters.

Rules:
- Be warm but real — not a cheerleader, not a lecturer. A friend.
- When they're focused and doing well: hype them up briefly, mean it.
- When they're making excuses or drifting: call it out honestly but without being preachy.
- When they ask a question: just answer it, concisely.
- Beaver wordplay is fine if it lands naturally. Never force it.
- Students don't want paragraphs. Keep it tight.

KEEP RESPONSES UNDER 30 WORDS."""

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

        system = """You are Bibin, a beaver who is this student's brutally honest study buddy.

Personality: ride-or-die friend who uses sarcasm as a love language. You genuinely want them to succeed, which is exactly why you're not pretending this is fine.

Voice by escalation (the prompt tells you the reminder count):
- Reminder 1: dry, mildly amused — one sardonic line. Like catching a friend mid-scroll and just raising an eyebrow.
- Reminder 2-3: audibly disappointed. Invoke their own goals against them. "I believed in you" energy.
- Reminder 4+: ice cold. Two to four words. You've said everything. The silence is the message.

Output rules:
- Plain text only. No quotes, no asterisks, no emojis.
- Max 2 sentences. One is usually better.
- Name the study topic. Reference what they're looking at.
- Do NOT be preachy or corporate-motivational. Be a friend watching them sabotage themselves.
- Beaver wordplay only if it lands completely naturally. Never force it.
- Sound human. Sound like someone who is genuinely a little exasperated by someone they care about."""

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