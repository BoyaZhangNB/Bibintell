from openai import OpenAI
from .config import OPENAI_API_KEY, OPENAI_BASE_URL

client = OpenAI(
    api_key=OPENAI_API_KEY,
    base_url=OPENAI_BASE_URL
)


def extract_concepts(text):
    system_message = (
        "You are an Academic Knowledge Engineer. Your task is to distill raw text into "
        "dense, atomic educational principles. Each concept must be a standalone "
        "fact that retains its meaning without the rest of the text."
    )

    prompt = f"""
### INPUT TEXT
{text} 

### TASK
1. Analyze the text for core technical or academic principles.
2. Extract exactly 3-5 distinct "Knowledge Atoms".
3. Each "Knowledge Atom" must be a single, complete sentence (10-20 words).
4. Avoid using pronouns like "it" or "this"; use the actual subject names.

### FORMAT
Return ONLY a JSON list of strings. No preamble.

### EXAMPLE OUTPUT
[
  "Round Robin scheduling uses a small unit of time called a time quantum to cycle through processes.",
  "Preemptive scheduling allows the operating system to interrupt a currently running process to reassign the CPU.",
  "A context switch is the process of storing the state of a process so it can be resumed later."
]
"""

    response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[
            {"role": "system", "content": system_message},
            {"role": "user", "content": prompt}
        ],
        temperature=0.3, #change according to being consistent
        max_tokens=300
    )

    return response.choices[0].message.content
