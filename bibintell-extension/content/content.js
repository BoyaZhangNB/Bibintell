console.log("Bibintell content script loaded");

// Announce readiness to background
chrome.runtime.sendMessage({ action: "contentReady" });

// Scrape and send relevance check
function scrapeAndSend() {
  const title = document.title;
  const url = window.location.href;

  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) return;

  const content = document.body.innerText.slice(0, 1000);

  chrome.storage.local.get("studyActive", (result) => {
    if (!result.studyActive) return; // only check if session is active
    chrome.runtime.sendMessage({
      action: "checkRelevance",
      data: { title, url, content }
    });
  });
}

window.addEventListener("load", () => {
  scrapeAndSend();
});