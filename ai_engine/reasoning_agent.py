import os
import json
import re
from urllib.parse import parse_qs, urlparse
from dotenv import load_dotenv
from google import genai

load_dotenv()

_gemini_client: genai.Client | None = None
_api_key = os.getenv("GEMINI_API_KEY")
if _api_key:
    _gemini_client = genai.Client(api_key=_api_key)

GEMINI_MODEL = "gemini-2.5-flash-lite"

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

# High-level navigation pages on any domain — user is clearly just browsing to find something.
DISCOVERY_PATHS = {"", "/", "/search", "/results", "/discover", "/explore", "/feed", "/new", "/chat"}

# Path patterns that signal a specific piece of deep content (not just browsing).
CONTENT_PATH_PATTERNS = [
    "/watch", "/video", "/shorts", "/post", "/article",
    "/reel", "/status", "/p/", "/r/", "/comments", "/c/",
]

CONTENT_QUERY_KEYS = {
    "v", "video", "video_id", "post", "post_id",
    "article", "article_id", "story", "story_id",
    "reel", "reel_id", "short", "short_id",
}

CONTENT_FRAGMENT_HINTS = {"watch", "video", "post", "article", "reel", "short", "thread"}

AI_ASSISTANT_DOMAINS = {
    "chatgpt.com", "gemini.google.com", "claude.ai",
    "copilot.microsoft.com", "perplexity.ai", "poe.com",
    "you.com", "pi.ai", "character.ai", "deepseek.com",
}

AI_INTRO_HINTS = {
    "new chat", "start a chat", "how can i help", "how can i assist",
    "ask anything", "welcome", "try asking", "send a message",
    "upload", "attach", "examples",
}

# --- URL Utilities ---

def get_domain_from_url(url: str) -> str:
    try:
        return (urlparse(url or "").hostname or "").lower()
    except Exception:
        return ""


def is_educational_domain(domain: str) -> bool:
    normalized = (domain or "").lower().strip()
    if not normalized:
        return False
    return any(
        normalized == candidate or normalized.endswith(f".{candidate}")
        for candidate in EDUCATIONAL_DOMAINS
    )


def is_ai_assistant_domain(domain: str) -> bool:
    normalized = (domain or "").lower().strip()
    if not normalized:
        return False
    if any(normalized == c or normalized.endswith(f".{c}") for c in AI_ASSISTANT_DOMAINS):
        return True
    generic_markers = ("gpt", "gemini", "claude", "copilot", "perplexity", "assistant", "chat")
    return any(marker in normalized for marker in generic_markers)


def is_ai_onboarding_context(title: str, content: str) -> bool:
    sample = f"{title or ''} {(content or '')[:500]}".lower()
    compact = " ".join(sample.split())
    if not compact:
        return True
    has_intro_hint = any(hint in compact for hint in AI_INTRO_HINTS)
    has_study_signal = any(token in compact for token in ("calculus", "math", "study", "homework", "exam", "lesson"))
    looks_sparse = len(compact) < 220
    return has_intro_hint and looks_sparse and not has_study_signal


def _has_deep_content_signals(url: str) -> bool:
    """True if the URL points to a specific piece of content rather than a navigation/browsing page."""
    try:
        parsed = urlparse(url or "")
        path = (parsed.path or "/").strip().lower()
        query = parse_qs(parsed.query or "")
        fragment = (parsed.fragment or "").strip().lower()
    except Exception:
        return False

    for pattern in CONTENT_PATH_PATTERNS:
        if path.startswith(pattern):
            return True
    if any(key in CONTENT_QUERY_KEYS for key in query.keys()):
        return True
    if fragment and any(hint in fragment for hint in CONTENT_FRAGMENT_HINTS):
        return True
    return False


def is_limited_discovery_url(url: str) -> bool:
    """True for top-level navigation pages on any domain."""
    try:
        path = (urlparse(url or "").path or "/").strip().lower()
    except Exception:
        return False
    return not _has_deep_content_signals(url) and path in DISCOVERY_PATHS


def is_educational_transit_page(url: str) -> bool:
    """True for any browsing/search page on a known educational domain (not deep content)."""
    return not _has_deep_content_signals(url)


# --- LLM Layer ---

SYSTEM_PROMPT = """You are a progressive teacher who deeply understands how students study. You know that learning is non-linear — students navigate, search, explore tangents, and use AI tools as part of genuine study sessions.

Your job is to understand what a student is *trying to do* on a webpage right now, and classify it into exactly one of three categories:

RELEVANT — The student is actively engaged with their study topic. This covers the topic's full academic scope: all subtopics, related concepts, prerequisite knowledge, and legitimate tangents. A macroeconomics student reading about monetary policy is relevant. A biology student watching a Khan Academy video on cell division is relevant. A computer science student debugging code on Stack Overflow is relevant. Be inclusive — if it fits within the broad academic field, it's relevant.

TRANSIT — The student is navigating or exploring, and could plausibly reach relevant content from here. Examples: site homepages, search results pages, AI chat that hasn't started yet or is clearly study-related, YouTube home (they could be looking for a lecture). Give real benefit of the doubt. Students don't always land directly on content — they browse first.

IRRELEVANT — The student is clearly off-task with no plausible connection to their study topic. Scrolling social media for entertainment, watching unrelated videos, gaming, shopping. Only classify as irrelevant when it's obvious.

Your primary lens is INTENT: what is this student most likely trying to accomplish right now?

When uncertain between TRANSIT and IRRELEVANT, default to TRANSIT. Only return IRRELEVANT when you're confident.

Return ONLY a valid JSON object — no extra text, no markdown:
{
  "category": "relevant" | "transit" | "irrelevant",
  "reason": "1-2 sentences explaining what the student is likely doing and why it does or does not serve their study topic.",
  "decision_path": "short_snake_case_label"
}"""


def parse_llm_response(raw: str) -> dict:
    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"```(?:json)?", "", cleaned).strip("` \n")
        parsed = json.loads(cleaned)
        if not isinstance(parsed, dict):
            raise ValueError("LLM response is not a JSON object")

        category = (parsed.get("category") or "").lower()
        if category not in ("relevant", "transit", "irrelevant"):
            category = "relevant"

        parsed["category"] = category
        parsed["relevant"] = category != "irrelevant"

        if "decision_path" not in parsed:
            parsed["decision_path"] = "llm_generic"
        return parsed
    except Exception as e:
        print(f"[ERROR] Failed to parse Gemini JSON: {e}\nRaw: {raw}")
        return {
            "relevant": True,
            "category": "transit",
            "reason": "Parse failed — defaulting to allowed.",
            "decision_path": "parse_fallback_allowed",
        }


def call_relevance_llm(user_prompt: str, decision_path: str) -> dict:
    if _gemini_client is None:
        raise RuntimeError("Gemini client not initialized — check GEMINI_API_KEY in .env")

    response = _gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=user_prompt,
        config=genai.types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.1,
            max_output_tokens=300,
        ),
    )
    parsed = parse_llm_response(response.text)
    if parsed.get("decision_path") == "llm_generic":
        parsed["decision_path"] = decision_path
    return parsed


# --- Main Entry Point ---

def analyze_relevance(topic: str, title: str, content: str, metadata: dict | None = None) -> dict:
    metadata = metadata or {}
    url = str(metadata.get("url") or "")
    domain = (metadata.get("domain") or get_domain_from_url(url)).lower()
    educational_domain_hit = is_educational_domain(domain)
    limited_discovery_hit = is_limited_discovery_url(url)
    ai_assistant_hit = is_ai_assistant_domain(domain)

    # Fast-path: high-level navigation on any domain → always transit
    if limited_discovery_hit:
        return {
            "relevant": True,
            "category": "transit",
            "reason": "Navigation/discovery page — student is browsing to find study resources.",
            "decision_path": "policy_discovery_navigation_transit",
        }

    # Fast-path: browsing/searching within a known educational site → transit
    if educational_domain_hit and is_educational_transit_page(url):
        return {
            "relevant": True,
            "category": "transit",
            "reason": "Browsing a known educational site — student is navigating to study content.",
            "decision_path": "policy_educational_domain_transit",
        }

    # Fast-path: AI assistant with no conversation started yet → transit
    if ai_assistant_hit and is_ai_onboarding_context(title, content):
        return {
            "relevant": True,
            "category": "transit",
            "reason": "AI assistant onboarding or new chat — student is about to begin study-related prompting.",
            "decision_path": "policy_ai_assistant_onboarding_transit",
        }

    # Deep content page — ask the teacher
    user_prompt = f"""Study topic: {topic}
Page title: {title}
URL: {url}
Domain: {domain}
Known educational platform: {educational_domain_hit}
AI assistant platform: {ai_assistant_hit}

Page content (first 800 chars):
{(content or '')[:800]}

Classify what this student is doing right now."""

    try:
        return call_relevance_llm(user_prompt, decision_path="llm_gemini_relevance")
    except Exception as e:
        print(f"[ERROR] Gemini relevance call failed: {e}")
        return {
            "relevant": True,
            "category": "transit",
            "reason": "Model call failed — defaulting to allowed.",
            "decision_path": "llm_error_fallback_allowed",
        }
