document.getElementById("startSession").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "summonBibin" });
  window.close();
});

document.getElementById("openDebugger").addEventListener("click", () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("debugger/debugger.html")
  });
  window.close();
});
