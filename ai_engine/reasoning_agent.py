from groq import Groq
import json
import re
from urllib.parse import urlparse
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


def is_homepage_url(url: str) -> bool:
    try:
        parsed = urlparse(url or "")
        path = (parsed.path or "/").strip().lower()
        return path in ["", "/"]
    except Exception:
        return False


def is_limited_discovery_url(url: str) -> bool:
    try:
        parsed = urlparse(url or "")
        path = (parsed.path or "/").strip().lower()
    except Exception:
        return False

    # "Benefit of the doubt" applies only to high-level navigation/discovery pages.
    discovery_paths = {
        "",
        "/",
        "/search",
        "/results",
        "/discover",
        "/explore",
        "/feed",
    }
    return path in discovery_paths


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
    homepage_hit = is_homepage_url(url)
    limited_discovery_hit = is_limited_discovery_url(url)

    # Limited discovery pages on educational domains are allowed for study navigation.
    if educational_domain_hit and limited_discovery_hit:
        return {
            "relevant": True,
            "reason": "Educational discovery/navigation page is allowed so the user can find relevant study resources.",
            "decision_path": "policy_educational_discovery_allowed",
        }

    system = """You are an Academic Content Auditor.

Determine whether the current webpage is relevant to the user's study topic.

Rules:
- Primary objective: decide if current page usage is relevant to the stated study topic.
- Treat domains in the educational domains list as potentially useful context only, not an automatic pass.
- Also treat unknown domains as potentially educational if there is plausible academic intent.
- Mark relevant when content is unclear but educational potential exists.
- Mark irrelevant when current visible intent is clearly unrelated to the study topic.
- Never mark a page relevant based only on platform reputation.
- This rule applies to every site, including sites in the educational list.
- Only limited discovery pages of an educational domain can be relevant by default for navigation.
- For non-homepage pages, always judge by current URL/content intent.
- For AI assistants (for example Gemini/ChatGPT/Claude), evaluate the apparent current query/topic, not just the platform name.
- Return strict JSON only."""

    educational_domains_csv = ", ".join(EDUCATIONAL_DOMAINS)

    prompt = f"""Study Topic: {topic}
Page Content (first 1000 chars):
{content[:1000]}

Metadata:
- URL: {url}
- Domain: {domain}
- Is Homepage URL: {homepage_hit}
- Is Limited Discovery URL: {limited_discovery_hit}

Educational Domains List:
{educational_domains_csv}

Educational Domain Match for this page: {educational_domain_hit}

Decision guidance:
1) If this page/domain may reasonably help study now or shortly, return relevant=true.
2) If current content/request is clearly unrelated to the study topic, return relevant=false.
3) Prefer caution: if ambiguous but educational potential exists, return relevant=true.
4) If Educational Domain Match is true and Is Limited Discovery URL is true, return relevant=true.
5) If Educational Domain Match is true but Is Limited Discovery URL is false and current intent is off-topic, return relevant=false.
6) For non-listed domains, still mark relevant when there is clear educational intent.

Return ONLY a valid JSON object — no extra text:
{{
  "relevant": boolean,
  "reason": "1-2 sentence justification.",
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