console.log("Bibintell content script loaded");

function scrapeAndSend() {
  const title = document.title;
  const url = window.location.href;

  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) return;

  const content = document.body.innerText.slice(0, 3000);

  chrome.runtime.sendMessage({
    action: "checkRelevance",
    data: { title, url, content }
  }, (response) => {
    // Suppress "no receiver" errors silently
    if (chrome.runtime.lastError) return;
  });
}

// Check on initial page load
window.addEventListener("load", () => {
  setTimeout(scrapeAndSend, 1000);
});

// Also check when user switches back to this tab
// This catches the case where studyActive was false on load
// but gets set to true during Bibin's conversation
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    scrapeAndSend();
  }
});