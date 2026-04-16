from groq import Groq
import json
import re
from dotenv import load_dotenv

load_dotenv()

client = Groq()  # reads GROQ_API_KEY from environment


def parse_llm_response(raw: str) -> dict:
    """Parse LLM JSON output, stripping markdown code fences if present."""
    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"```(?:json)?", "", cleaned).strip("` \n")
        return json.loads(cleaned)
    except Exception as e:
        print(f"[ERROR] Failed to parse LLM JSON: {e}\nRaw: {raw}")
        # Conservative fallback: avoid false-positive interventions when model output is malformed.
        return {"relevant": True, "reason": "Parse failed — defaulting to relevant."}


def analyze_relevance(topic: str, title: str, content: str) -> dict:
    """
    Ask the LLM whether the current page is relevant to the study topic.
    Returns: {"relevant": bool, "reason": str}
    """
    system = """You are an Academic Content Auditor.

Determine whether the current webpage is relevant to the user's study topic.

Rules:
- ALLOW: direct study content, prerequisite concepts, worked examples, adjacent academic topics.
- BLOCK: entertainment, social media, clickbait, unrelated browsing, general news.
- Be balanced. A student clarifying a concept or looking at examples is fine.
- Only block content that clearly breaks academic focus."""

    prompt = f"""Study Topic: {topic}
Page Title: {title}
Page Content (first 1000 chars):
{content[:1000]}

Return ONLY a valid JSON object — no extra text:
{{
  "relevant": boolean,
  "reason": "1-2 sentence justification."
}}"""

    # Strict prompt + low temperature keeps the response predictable JSON for the extension pipeline.
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt}
        ],
        temperature=0.1,
        max_tokens=150
    )
    return parse_llm_response(response.choices[0].message.content)