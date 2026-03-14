import json
from openai import OpenAI
from .config import OPENAI_API_KEY, OPENAI_BASE_URL
from .embedding_service import embed_text
from .vector_store import vector_store

client = OpenAI(
    api_key=OPENAI_API_KEY,
    base_url=OPENAI_BASE_URL
)

def bootstrap_topic(topic):
    system_message = (
        "You are a Subject Matter Expert and Curriculum Architect. Your goal is to "
        "provide a foundational knowledge base for a student starting a new topic."
    )

    prompt = f"""
### TOPIC
{topic}

### TASK
Generate 5-8 foundational "Knowledge Anchors" for this topic. 
Each anchor must be a dense, descriptive sentence that defines a core sub-concept.

### REQUIREMENTS
1. Each concept must be a standalone definition (e.g., "The Kernel is the core part of an OS that manages hardware and memory").
2. Cover different sub-areas of the topic to create a wide semantic net.
3. Use formal, technical language.

### RESPONSE FORMAT
Return ONLY a JSON list of strings. Do not include any text before or after the JSON.

Example:
["Concept A definition...", "Concept B definition..."]
"""
    response= client.chat.completions.create(
        model= "openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content":system_message },
            {"role": "user", "content": prompt}
        ],
        temperature=0.3, #change according to consistency
        max_tokens=300
    )

    raw_content = response.choices[0].message.content

    
    if raw_content is None:
        print("Warning: GPT returned None, using fallback default concepts")
        concepts = ["concept placeholder 1", "concept placeholder 2"]
    else:
        try:
            concepts = json.loads(raw_content)
            if not isinstance(concepts, list):
                raise ValueError("JSON is not a list")
        except Exception as e:
            print("Warning: failed to parse JSON, fallback to split by lines")
            concepts = [line.strip() for line in raw_content.split("\n") if line.strip()]

    for concept in concepts:
        emb = embed_text(concept)
        vector_store.add(emb, concept)