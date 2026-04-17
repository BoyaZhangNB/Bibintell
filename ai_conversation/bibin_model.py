import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()


class BibinModel:

    def __init__(self):
        self.nudge_model_name = "llama-3.3-70b-versatile"
        api_key = os.getenv("GROQ_API_KEY")
        self.client = Groq(api_key=api_key) if api_key else Groq()  # fallback to existing env behavior

    def generate_nudge(self, prompt: str) -> str:
        print(
            f"[BibinModel.nudge] start model={self.nudge_model_name} prompt_len={len(prompt or '')}",
            flush=True,
        )

        system = """You are Bibin, a beaver study coach with sharp wit and real accountability energy.

Style escalation:
- Reminder 1: playful with one beaver pun.
- Reminder 2-3: firmer, less playful.
- Reminder 4+: stern and direct.

Output rules:
- Plain text only, no quotes, no emojis.
- Exactly one sentence.
- Max 18 words.
- Must include study topic.
- Include one short metric when available (focus %, minutes, or interventions).
- Use one neutral page-context clue if provided.
- Never insult and never name exact domain/site.
    """

        try:
            response = self.client.chat.completions.create(
                model=self.nudge_model_name,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=64,
                temperature=0.8,
            )

            message = response.choices[0].message if response.choices else None
            nudge = message.content if message else ""
        except Exception as e:
            print(f"[BibinModel.nudge] groq_error model={self.nudge_model_name} error={e}", flush=True)
            return "Back to your study topic now. Stay focused."

        print(
            f"[BibinModel.nudge] parsed_len={len(nudge or '') if isinstance(nudge, str) else 0} parsed_preview={(nudge or '')[:180]!r}",
            flush=True,
        )

        if isinstance(nudge, str) and nudge.strip():
            return nudge.strip()

        print(
            f"[BibinModel.nudge] empty_output_from_model={self.nudge_model_name}",
            flush=True,
        )
        return "Back to your study topic now. Stay focused."