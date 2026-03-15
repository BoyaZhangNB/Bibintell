console.log("Bibintell content script loaded");

// Scrape page content and send to background when page loads
function scrapeAndSend() {
  const title = document.title;
  const url = window.location.href;

  // Skip chrome:// pages and extension pages
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) return;

  // Get main body text, trimmed to avoid sending megabytes
  const content = document.body.innerText.slice(0, 3000);

  chrome.runtime.sendMessage({
    action: "checkRelevance",
    data: { title, url, content }
  });
}

// Run on load
window.addEventListener("load", () => {
  scrapeAndSend();
});