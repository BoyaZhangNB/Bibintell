from openai import OpenAI
from .config import OPENAI_API_KEY, OPENAI_BASE_URL

client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

def analyze_relevance(topic, page_data, similarity, concepts):
    system_instructions = (
        "You are a strict Academic Content Auditor. Your job is to prevent 'Productive Procrastination'. "
        "A page is ONLY relevant if it directly contributes to the user's specific study topic. "
        "Generic news, social media, or tangentially related entertainment must be marked as relevant: false."
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
1. **Direct Alignment:** Does the content explain, practice, or analyze the study topic?
2. **Semantic Check:** If the Similarity Score is < 0.35 AND the content doesn't mention {topic}, it is likely irrelevant.
3. **Distraction Check:** Is this a 'rabbit hole' (e.g., a tech news site, a forum, or a video with a clickbait title)? If yes, relevant = false.

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