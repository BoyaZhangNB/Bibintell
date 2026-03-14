from .config import MAX_PAGE_CHARS

def process_page(title: str, content: str, url: str):
    content= content[:MAX_PAGE_CHARS]

    return {
        "title": title,
        "content": content,
        "url": url
    }
