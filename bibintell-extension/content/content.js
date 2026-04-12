console.log("Bibintell content script loaded");

function debugEvent(event, details = {}) {
  chrome.runtime.sendMessage({
    action: "contentDebugLog",
    event,
    details,
  });
}

chrome.runtime.sendMessage({ action: "contentReady" });

let lastSentUrl = "";
let scrapeTimeout = null;

function isSupportedUrl(url) {
  return !(url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("about:"));
}

function scheduleScrape(reason) {
  if (scrapeTimeout) {
    clearTimeout(scrapeTimeout);
  }

  scrapeTimeout = setTimeout(() => {
    scrapeAndSend(reason);
  }, 300);
}

function scrapeAndSend(reason) {
  const title = document.title || "";
  const url = window.location.href || "";

  if (!isSupportedUrl(url)) {
    debugEvent("scrape_skipped_unsupported_url", { url, reason });
    return;
  }

  if (!document.body) {
    debugEvent("scrape_skipped_no_body", { url, reason });
    return;
  }

  if (lastSentUrl === url && reason !== "manual") {
    return;
  }

  const content = document.body.innerText.slice(0, 1000);

  chrome.storage.local.get("studyActive", (result) => {
    if (!result.studyActive) {
      debugEvent("scrape_skipped_study_inactive", { url, reason });
      return;
    }

    lastSentUrl = url;

    chrome.runtime.sendMessage({
      action: "checkRelevance",
      data: { title, url, content, reason },
    });

    debugEvent("scrape_sent", {
      reason,
      url,
      title,
      contentLength: content.length,
    });
  });
}

function notifyRouteChange(reason) {
  scheduleScrape(reason);
}

function patchHistoryMethod(methodName) {
  const original = history[methodName];
  if (typeof original !== "function") return;

  history[methodName] = function patchedHistoryMethod(...args) {
    const result = original.apply(this, args);
    notifyRouteChange(`history_${methodName}`);
    return result;
  };
}

patchHistoryMethod("pushState");
patchHistoryMethod("replaceState");

window.addEventListener("load", () => notifyRouteChange("window_load"));
window.addEventListener("focus", () => notifyRouteChange("window_focus"));
window.addEventListener("popstate", () => notifyRouteChange("popstate"));
window.addEventListener("hashchange", () => notifyRouteChange("hashchange"));

const titleElement = document.querySelector("title");
if (titleElement) {
  const titleObserver = new MutationObserver(() => {
    notifyRouteChange("title_mutation");
  });

  titleObserver.observe(titleElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

setInterval(() => {
  if (window.location.href !== lastSentUrl) {
    notifyRouteChange("url_poll_change");
  }
}, 1500);
