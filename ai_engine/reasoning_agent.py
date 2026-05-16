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

AI_ASSISTANT_DOMAINS = {
    "chatgpt.com",
    "gemini.google.com",
    "claude.ai",
    "copilot.microsoft.com",
    "perplexity.ai",
    "poe.com",
    "you.com",
    "pi.ai",
    "character.ai",
    "deepseek.com",
}

AI_INTRO_HINTS = {
    "new chat",
    "start a chat",
    "how can i help",
    "how can i assist",
    "ask anything",
    "welcome",
    "try asking",
    "send a message",
    "upload",
    "attach",
    "examples",
}


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


def is_ai_assistant_domain(domain: str) -> bool:
    normalized = (domain or "").lower().strip()
    if not normalized:
        return False

    if any(normalized == candidate or normalized.endswith(f".{candidate}") for candidate in AI_ASSISTANT_DOMAINS):
        return True

    generic_ai_markers = ("gpt", "gemini", "claude", "copilot", "perplexity", "assistant", "chat")
    return any(marker in normalized for marker in generic_ai_markers)


def is_ai_onboarding_context(title: str, content: str) -> bool:
    sample = f"{title or ''} {(content or '')[:500]}".lower()
    compact = " ".join(sample.split())
    if not compact:
        return True

    has_intro_hint = any(hint in compact for hint in AI_INTRO_HINTS)
    has_study_signal = any(token in compact for token in ("calculus", "math", "study", "homework", "exam", "lesson"))
    looks_sparse = len(compact) < 220

    # Allow short onboarding/new-chat states before the user starts a real conversation.
    return has_intro_hint and looks_sparse and not has_study_signal


def _has_deep_content_signals(url: str) -> bool:
    """True if the URL has path/query/fragment signals indicating a specific piece of content."""
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
    """True only for high-level navigation pages on any domain, never deep content pages."""
    try:
        path = (urlparse(url or "").path or "/").strip().lower()
    except Exception:
        return False
    return not _has_deep_content_signals(url) and path in DISCOVERY_PATHS


def is_educational_transit_page(url: str) -> bool:
    """True for any non-deep-content page on a known educational domain.
    Allows browsing/searching the site before landing on a specific resource."""
    return not _has_deep_content_signals(url)


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
    ai_assistant_hit = is_ai_assistant_domain(domain)

    # Navigation/discovery pages are always allowed while users search for resources.
    if limited_discovery_hit:
        return {
            "relevant": True,
            "reason": "Navigation/discovery page is allowed so the user can find relevant study resources.",
            "decision_path": "policy_discovery_navigation_allowed",
        }

    # Any non-deep-content page on an educational domain is treated as transit —
    # the user is browsing/searching the site before reaching actual study material.
    if educational_domain_hit and is_educational_transit_page(url):
        return {
            "relevant": True,
            "reason": "Browsing page on a known educational site — user is likely navigating to study content.",
            "decision_path": "policy_educational_domain_transit_allowed",
        }

    if ai_assistant_hit and is_ai_onboarding_context(title, content):
        return {
            "relevant": True,
            "reason": "AI assistant onboarding/new-chat context is allowed so the user can begin study-related prompting.",
            "decision_path": "policy_ai_assistant_onboarding_allowed",
        }

    system = """You are an Academic Content Auditor.

Determine whether the current webpage is relevant to the user's study topic.

Rules:
- Think about the FULL academic scope of the study topic. A subject like "macroeconomics" covers monetary policy, fiscal policy, inflation, GDP, interest rates, aggregate demand/supply, exchange rates, trade, recessions, and more. A subject like "biology" covers cells, genetics, evolution, ecology, physiology, etc. Be inclusive: any legitimate subtopic, related concept, or foundational idea within the field counts as relevant.
- Judge deep-content pages by whether the title/content falls within the academic scope of the study topic — not whether it uses the exact subject name.
- AI assistants are judged by current conversation intent, not platform name.
- When in doubt for academic content, prefer relevant=true over false.
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
2. Deep content pages (videos, articles, posts, threads) -> judge by whether the content falls within the academic scope of "{topic}", including all its subtopics, related concepts, and prerequisite knowledge.
3. AI assistants (ChatGPT, Claude, Gemini, etc.):
    - If the page is onboarding/new chat with little content, allow as relevant=true.
    - Once there is substantive conversation content, judge strictly by whether that content serves the study topic.
4. If deep-content evidence is weak (generic title like "YouTube" and thin content), prefer relevant=false unless topic evidence exists.
5. If content is clearly unrelated to the academic field of "{topic}" -> relevant=false.
6. Examples of scope — "macroeconomics" includes monetary policy, fiscal policy, interest rates, inflation, GDP, aggregate demand; "calculus" includes limits, derivatives, integrals, series; "organic chemistry" includes reaction mechanisms, functional groups, stereochemistry. Apply the same broad thinking to the actual study topic.

Return ONLY a valid JSON object — no extra text:
{{
  "relevant": boolean,
  "reason": "1-2 sentence justification referencing the page title or content and how it relates to the study topic scope.",
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