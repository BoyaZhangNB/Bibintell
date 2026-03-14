document.getElementById("startSession").addEventListener("click", async () => {
  const topic = window.prompt("What are you studying right now?");
  if (!topic) return;

  // Save topic so content script knows what to check
  chrome.storage.local.set({ studySubject: topic });

  // Notify backend to reset state
  try {
    await fetch("http://127.0.0.1:8000/start-dam-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    });
  } catch (err) {
    console.error("Could not start session:", err);
  }

  chrome.runtime.sendMessage({ action: "summonBibin" });
  window.close();
});