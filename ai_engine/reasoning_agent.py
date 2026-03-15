from openai import OpenAI
from .config import OPENAI_API_KEY, OPENAI_BASE_URL

client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

def analyze_relevance(topic, page_data, similarity, concepts):
    system_instructions = (
        "You are an Academic Content Auditor. Your job is to prevent 'Productive Procrastination', "
        "but you must consider foundational or closely related subjects relevant. "
        "For example, Calculus pages can be relevant for Physics study, "
        "and Chemistry concepts may support Biology, etc. "
        "Generic entertainment, clickbait, or unrelated forums must still be marked irrelevant."
    )

    
    #change 450 to anything suitable, threshold 0.4 and <0.35
    prompt = f"""
### CONTEXT
- **User's Primary Study Goal:** {topic}
- **Retrieved Academic Concepts:** {", ".join(concepts)}
- **Semantic Similarity Score:** {similarity} (Threshold: 0.4)

### CURRENT PAGE DATA
- **Title:** {page_data["title"]}
- **Content Snippet:** {page_data["content"][:450]}

### CRITERIA FOR RELEVANCE
1. **Direct or Foundational Alignment:** Content is relevant if it explains, practices, analyzes, or conceptually supports the study topic or closely related foundational topics.
2. **Semantic Check:** If the Similarity Score is < 0.35, consider relevance if the content supports key concepts of {topic}.
3. **Distraction Check:** Pages that are clearly entertainment, clickbait, forums, or unrelated media should be marked as irrelevant.

### RESPONSE SPECIFICATION
Return ONLY a valid JSON object. Do not include conversational filler.
{{
  "relevant": boolean,
  "confidence": float (0.0 to 1.0),
  "reason": "A one or two sentence cold, objective justification."
}}
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

    return response.choices[0].message.content