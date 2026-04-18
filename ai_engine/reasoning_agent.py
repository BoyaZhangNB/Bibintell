from groq import Groq
import json
import re
from urllib.parse import parse_qs, urlparse
from dotenv import load_dotenv

load_dotenv()

client = Groq()  # reads GROQ_API_KEY from environment

EDUCATIONAL_DOMAINS = [
    "chatgpt.com",
    "gemini.google.com",
    "claude.ai",
    "quizlet.com",
    "knowt.com",
    "brainscape.com",
    "ankiweb.net",
    "jstor.org",
    "refseek.com",
    "chegg.com",
    "brainly.com",
    "khanacademy.org",
    "wolframalpha.com",
    "desmos.com",
    "coursera.org",
    "edx.org",
    "udemy.com",
    "skillshare.com",
    "codecademy.com",
    "freecodecamp.org",
    "w3schools.com",
    "notion.so",
    "grammarly.com",
    "evernote.com",
    "docs.google.com",
    "scholar.google.com",
    "arxiv.org",
    "wikipedia.org",
    "youtube.com",
]

# Pages that are clearly navigation/launching pads.
DISCOVERY_PATHS = {"", "/", "/search", "/results", "/discover", "/explore", "/feed", "/new", "/chat"}

# Path patterns that indicate deep-content pages that require strict content judgment.
CONTENT_PATH_PATTERNS = [
    "/watch",
    "/video",
    "/shorts",
    "/post",
    "/article",
    "/reel",
    "/status",
    "/p/",
    "/r/",
    "/comments",
    "/c/",
]

# Query or hash hints that typically represent opening a specific piece of content.
CONTENT_QUERY_KEYS = {
    "v",
    "video",
    "video_id",
    "post",
    "post_id",
    "article",
    "article_id",
    "story",
    "story_id",
    "reel",
    "reel_id",
    "short",
    "short_id",
}

CONTENT_FRAGMENT_HINTS = {"watch", "video", "post", "article", "reel", "short", "thread"}


def is_educational_domain(domain: str) -> bool:
    normalized = (domain or "").lower().strip()
    if not normalized:
        return False

    return any(
        normalized == candidate or normalized.endswith(f".{candidate}")
        for candidate in EDUCATIONAL_DOMAINS
    )


def get_domain_from_url(url: str) -> str:
    try:
        return (urlparse(url or "").hostname or "").lower()
    except Exception:
        return ""


def is_limited_discovery_url(url: str) -> bool:
    """True only for high-level navigation pages, never deep content pages."""
    try:
        parsed = urlparse(url or "")
        path = (parsed.path or "/").strip().lower()
        query = parse_qs(parsed.query or "")
        fragment = (parsed.fragment or "").strip().lower()
    except Exception:
        return False

    for pattern in CONTENT_PATH_PATTERNS:
        if path.startswith(pattern):
            return False

    if any(key in CONTENT_QUERY_KEYS for key in query.keys()):
        return False

    if fragment and any(hint in fragment for hint in CONTENT_FRAGMENT_HINTS):
        return False

    return path in DISCOVERY_PATHS


def parse_llm_response(raw: str) -> dict:
    """Parse LLM JSON output, stripping markdown code fences if present."""
    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"```(?:json)?", "", cleaned).strip("` \n")
        parsed = json.loads(cleaned)
        if not isinstance(parsed, dict):
            raise ValueError("LLM response is not a JSON object")
        if "decision_path" not in parsed:
            parsed["decision_path"] = "llm_generic"
        return parsed
    except Exception as e:
        print(f"[ERROR] Failed to parse LLM JSON: {e}\nRaw: {raw}")
        # Conservative fallback: avoid false-positive interventions when model output is malformed.
        return {
            "relevant": True,
            "reason": "Parse failed — defaulting to relevant.",
            "decision_path": "parse_fallback_relevant",
        }


def call_relevance_llm(system: str, prompt: str, decision_path: str) -> dict:
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        temperature=0.1,
        max_tokens=180,
    )

    parsed = parse_llm_response(response.choices[0].message.content)
    if "decision_path" not in parsed or parsed.get("decision_path") == "llm_generic":
        parsed["decision_path"] = decision_path
    return parsed


def analyze_relevance(topic: str, title: str, content: str, metadata: dict | None = None) -> dict:
    """
    Ask the LLM whether the current page is relevant to the study topic.
    Returns: {"relevant": bool, "reason": str}
    """
    metadata = metadata or {}
    url = str(metadata.get("url") or "")
    domain = (metadata.get("domain") or get_domain_from_url(url)).lower()
    educational_domain_hit = is_educational_domain(domain)
    limited_discovery_hit = is_limited_discovery_url(url)

    # Navigation/discovery pages are always allowed while users search for resources.
    if limited_discovery_hit:
        return {
            "relevant": True,
            "reason": "Navigation/discovery page is allowed so the user can find relevant study resources.",
            "decision_path": "policy_discovery_navigation_allowed",
        }

    system = """You are an Academic Content Auditor.

Determine whether the current webpage is relevant to the user's study topic.

Rules:
- Primary objective: decide if current page usage is relevant to the stated study topic.
- Judge deep-content pages strictly by current title/content vs study topic.
- AI assistants are judged by current conversation intent, not platform name.
- Return strict JSON only."""

    educational_domains_csv = ", ".join(EDUCATIONAL_DOMAINS)

    prompt = f"""Study Topic: {topic}
Page Title: {title}
Page Content (first 1000 chars):
{content[:1000]}

Metadata:
- Full URL: {url}
- Domain: {domain}
- Is navigation/discovery page: {limited_discovery_hit}
- Is known educational domain: {educational_domain_hit}

Educational Domains List:
{educational_domains_csv}

Decision guidance:
1. Navigation/discovery pages (homepages, search results) -> relevant=true, user is finding resources.
2. Deep content pages (videos, articles, posts, threads) -> judge strictly by title and content vs study topic.
3. AI assistants (ChatGPT, Claude, Gemini, etc.) -> judge by apparent conversation topic in content.
4. If deep-content evidence is weak (generic title like "YouTube" and thin content), prefer relevant=false unless topic evidence exists.
5. If content is clearly unrelated to "{topic}" -> relevant=false.

Return ONLY a valid JSON object — no extra text:
{{
  "relevant": boolean,
    "reason": "1-2 sentence justification referencing the page title or content.",
  "decision_path": "short snake_case label"
}}"""

    try:
        return call_relevance_llm(system, prompt, decision_path="llm_metadata_relevance")
    except Exception as e:
        print(f"[ERROR] LLM relevance call failed: {e}")
        return {
            "relevant": True,
            "reason": "Model call failed — defaulting to relevant.",
            "decision_path": "llm_error_fallback_relevant",
        }