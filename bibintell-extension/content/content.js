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

// Listen for background.js telling us to show Bibin
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "bibinIntervene" || message.action === "showBibin") {
    summonBibinToPage(message.reason || "You are straying from the dam! Get back to work!");
  }
  sendResponse({status: "ok"});
  return true; 
});

// The visual popup code
function summonBibinToPage(guiltMessage) {
  if (document.getElementById("bibin-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "bibin-overlay";
  
  overlay.style.cssText = `
      position: fixed; bottom: 30px; right: 30px; background-color: #5d4037; 
      color: #fff; padding: 25px; border-radius: 20px; z-index: 2147483647; 
      box-shadow: 0px 10px 30px rgba(0,0,0,0.7); font-family: sans-serif;
      max-width: 320px; text-align: center;
  `;

  overlay.innerHTML = `
      <div style="font-size: 60px; margin-bottom: 15px;">🦫</div>
      <h2 style="margin: 0 0 10px 0; color: #ffccbc; font-size: 20px;">STOP LEAKING FOCUS!</h2>
      <p style="margin: 0; font-size: 16px; line-height: 1.4;">${guiltMessage}</p>
      <button onclick="this.parentElement.remove()" style="margin-top: 15px; background: #8d6e63; border: none; color: white; padding: 5px 10px; border-radius: 5px; cursor: pointer;">I'll go back to my dam work...</button>
  `;

  document.body.appendChild(overlay);
}