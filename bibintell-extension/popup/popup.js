document.getElementById("startSession").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "summonBibin" });
  window.close();
});