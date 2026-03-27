from groq import Groq
import json
import re
from dotenv import load_dotenv
load_dotenv()

def parse_llm_response(raw: str) -> dict:
    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"```(?:json)?", "", cleaned).strip("` \n")
        return json.loads(cleaned)
    except Exception as e:
        print(f"[ERROR] Failed to parse LLM JSON: {e}\nRaw: {raw}")
        return {"relevant": True, "confidence": 0.5, "reason": "Parse failed — defaulting to relevant"}

client = Groq()

def analyze_relevance(topic, page_data, similarity):
    system_instructions = f"""
        You are an Academic Content Auditor.

Your role is to determine whether the current page is relevant to the user's study session. 
Your goal is to reduce unproductive distractions (procrastination) WITHOUT blocking natural, realistic learning behavior.

You must think like a focused but practical student:
- Students often explore supporting concepts, examples, or adjacent topics.
- Short detours for clarification or intuition-building are acceptable.
- However, drifting into entertainment, social media, or loosely related browsing is not acceptable.

    """

    
    #change 450 to anything suitable, threshold 0.4 and <0.35
    prompt = f"""
### CONTEXT
- User's Primary Study Goal: {topic}
- Semantic Similarity Score: {similarity} (Threshold: 0.4)

---

### CURRENT PAGE DATA
- Title: {page_data["title"]}
- Content Snippet: {page_data["content"][:450]}

---

### RELEVANCE GUIDELINES

1. Direct Relevance:
Content is relevant if it directly explains, practices, or applies the study goal.

2. Foundational / Adjacent Learning:
Content is still relevant if it supports understanding through:
- prerequisite knowledge (e.g., algebra for calculus)
- cross-domain support (e.g., calculus for physics, chemistry for biology)
- worked examples, intuition, or deeper explanations

3. Natural Study Drift (Allowed):
Mark as relevant if the page reflects realistic learning behavior, such as:
- clarifying a confusing subtopic
- reviewing definitions or background concepts
- exploring examples closely tied to the main topic
- facts about the topic that enhance understanding (e.g., historical context, applications) even if its not an inherently academic page

4. Weak or Irrelevant Drift (Not Allowed):
Mark as NOT relevant if the page is:
- entertainment, social media, or clickbait
- general browsing with no clear academic value
- forums or discussions without structured educational content
- only loosely or superficially related to the study goal

5. Semantic Signal:
- If similarity >= 0.4 → likely relevant unless clearly distracting
- If similarity < 0.35 → only mark relevant if strong conceptual support is evident


### DECISION STYLE
- Be balanced, not strict.
- Default to allowing productive learning paths.
- Only block content that clearly breaks academic focus.


### RESPONSE FORMAT
Return ONLY a valid JSON object:

{
  "relevant": boolean,
  "confidence": float (0.0 to 1.0),
  "reason": "1–2 sentence cold, objective justification based on academic relevance."
}
"""
    response=client.chat.completions.create(
        model= "openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": system_instructions},
            {"role": "user", "content": prompt}
        ],
        temperature=0.1, #lesser temperature means more deterministic and strict
        max_tokens=250 #can change
    )
    raw = response.choices[0].message.content
    return parse_llm_response(raw)