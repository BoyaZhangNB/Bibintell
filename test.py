# test_groq.py — run this in your project root
from groq import Groq

client = Groq()  # picks up GROQ_API_KEY from environment

try:
    response = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[{"role": "user", "content": "Reply with just the word: working"}],
        max_tokens=10
    )
    print("✅ Groq working:", response.choices[0].message.content)
except Exception as e:
    print("❌ Groq failed:", e)