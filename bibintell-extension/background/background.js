// =====================
// Track active tab title
// =====================
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (!tab) return;
    chrome.storage.local.set({ lastActiveTab: tab.title });
  });
});

// =====================
// Study Session Management
// =====================
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.studyActive) {
    const previousState = Boolean(changes.studyActive.oldValue);
    const currentState = Boolean(changes.studyActive.newValue);

    if (previousState === currentState) return;

    if (currentState) {
      chrome.storage.local.set({
        studySessionActive: true,
        studySessionStartTime: Date.now()
      });
    } else {
      chrome.storage.local.set({
        studySessionActive: false,
        studySessionStartTime: null
      });
    }
  }
});

// =====================
// Auto-show Bibin on fresh browser launch
// =====================
function resetSessionFlags() {
  chrome.storage.session.clear(() => {
    chrome.storage.session.set({ bibinDone: false, bibinShown: false });
  });
}

chrome.runtime.onStartup.addListener(resetSessionFlags);
chrome.runtime.onInstalled.addListener(resetSessionFlags);

// =====================
// Tab fully loaded → show Bibin if needed (fallback)
// =====================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.active) return;

  const url = tab.url || "";
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:")
  ) return;

  chrome.storage.session.get(["bibinDone", "bibinShown"], (result) => {
    if (result.bibinDone || result.bibinShown) return;

    chrome.storage.session.set({ bibinShown: true });

    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, { action: "showBibin" }, (response) => {
        if (chrome.runtime.lastError) {
          console.log("Tab not ready (onUpdated):", chrome.runtime.lastError.message);
          chrome.storage.session.set({ bibinShown: false });
        }
      });
    }, 500);
  });
});

// =====================
// All message handling
// =====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // =====================
  // Content script ready — primary trigger for showing Bibin
  // =====================
  if (message.action === "contentReady") {
    chrome.storage.session.get(["bibinDone", "bibinShown"], (result) => {
      if (result.bibinDone || result.bibinShown) return;

      chrome.storage.session.set({ bibinShown: true });

      chrome.tabs.sendMessage(sender.tab.id, { action: "showBibin" }, (response) => {
        if (chrome.runtime.lastError) {
          console.log("contentReady send failed:", chrome.runtime.lastError.message);
          chrome.storage.session.set({ bibinShown: false });
        }
      });
    });
  }

  // =====================
  // Summon Bibin manually from popup
  // =====================
  if (message.action === "summonBibin") {
    chrome.storage.session.set({ bibinDone: false, bibinShown: true });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0] || !tabs[0].id) return;

      const url = tabs[0].url || "";
      if (
        url.startsWith("chrome://") ||
        url.startsWith("chrome-extension://") ||
        url.startsWith("about:") ||
        url === ""
      ) {
        console.log("Cannot summon on this page:", url);
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, { action: "showBibin" }, (response) => {
        if (chrome.runtime.lastError) {
          console.log("Could not summon Bibin:", chrome.runtime.lastError.message);
        }
      });
    });
  }

  // =====================
  // Bibin dismissed
  // =====================
  if (message.action === "bibinDone") {
    chrome.storage.session.set({ bibinDone: true, bibinShown: false });
  }

  // =====================
  // Page relevance check
  // =====================
  if (message.action === "checkRelevance") {
    const { title, url, content } = message.data;
    const senderTabId = sender.tab?.id;

    chrome.storage.local.get(["studySubject", "studyActive"], async (result) => {
      const topic = result.studySubject;

      if (!topic || !result.studyActive) {
        console.log("Skipping relevance check — no active session");
        return;
      }

      try {
        const response = await fetch("http://127.0.0.1:8000/check_relevance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, title, content, url })
        });

        const data = await response.json();
        console.log("Relevance result:", data);

        // Parse llm_analysis if it came back as a string
        let analysis = data.llm_analysis;
        if (typeof analysis === "string") {
          try {
            analysis = JSON.parse(analysis);
          } catch (e) {
            console.log("Failed to parse llm_analysis:", e);
            return;
          }
        }

        console.log("drift_detected:", data.drift_detected, "| relevant:", analysis?.relevant);

        // Store relevancy history for debugging
        chrome.storage.local.get(["relevancyHistory"], (histResult) => {
          let history = histResult.relevancyHistory || [];
          history.push({
            timestamp: Date.now(),
            title, url,
            result: { ...data, llm_analysis: analysis },
            topic
          });
          if (history.length > 20) history = history.slice(-20);
          chrome.storage.local.set({ relevancyHistory: history });
        });

        // Intervene if drift detected
        if (analysis?.relevant === false) {
          if (!senderTabId) {
            console.log("No sender tab ID, skipping intervene");
            return;
          }

          console.log("Sending bibinIntervene to tab:", senderTabId);

          chrome.tabs.sendMessage(
            senderTabId,
            {
              action: "bibinIntervene",
              reason: analysis?.reason || "You're drifting from your study topic!",
              topic
            },
            (response) => {
              if (chrome.runtime.lastError) {
                console.log("Intervene failed:", chrome.runtime.lastError.message);
              } else {
                console.log("Intervene sent successfully ✅");
              }
            }
          );
        }

      } catch (err) {
        console.log("Relevance check failed:", err);
      }
    });
  }

  return true; // ✅ keeps message port open for async handlers

});