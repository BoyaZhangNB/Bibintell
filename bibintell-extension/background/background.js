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
// Listen for explicit study activity state changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.studyActive) {
    const previousState = Boolean(changes.studyActive.oldValue);
    const currentState = Boolean(changes.studyActive.newValue);

    // Skip writes when the active state didn't actually change.
    if (previousState === currentState) {
      return;
    }

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
// Tab fully loaded → show Bibin if needed
// =====================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.active) return;

  chrome.storage.session.get(["bibinDone", "bibinShown"], (result) => {
    if (result.bibinDone || result.bibinShown) return;

    chrome.storage.session.set({ bibinShown: true });
    chrome.tabs.sendMessage(tabId, { action: "showBibin" }, (response) => {
      if (chrome.runtime.lastError) {
        console.log("Tab not ready:", chrome.runtime.lastError.message);
        chrome.storage.session.set({ bibinShown: false });
      }
    });
  });
});

// =====================
// Listen for messages from popup/content
// =====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Summon Bibin manually from popup
  if (message.action === "summonBibin") {
    chrome.storage.session.set({ bibinDone: false, bibinShown: true });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0] || !tabs[0].id) return;
      chrome.tabs.sendMessage(tabs[0].id, { action: "showBibin" }, (response) => {
        if (chrome.runtime.lastError) {
          console.log("Could not summon Bibin:", chrome.runtime.lastError.message);
        }
      });
    });
  }

  // Mark Bibin as done for the current session
  if (message.action === "bibinDone") {
    chrome.storage.session.set({ bibinDone: true, bibinShown: false });
  }

  // =====================
  // Page relevance check
  // =====================
  if (message.action === "checkRelevance") {
    const { title, url, content } = message.data;

    // Use damSession from popup.js
    chrome.storage.local.get(["damSession"], async (result) => {
      const session = result.damSession;
      if (!session || !session.subject) return; // No active session

      try {
        const response = await fetch("http://127.0.0.1:8000/check_relevance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: session.subject,
            title,
            content,
            url
          })
        });

        const data = await response.json();
        console.log("Relevance result:", data);

        // Store relevancy history for debugging
        chrome.storage.local.get(["relevancyHistory"], (result) => {
          let history = result.relevancyHistory || [];

          // Add new entry
          history.push({
            timestamp: Date.now(),
            title: title,
            url: url,
            result: data,
            topic: topic
          });

          // Keep only last 20 entries
          if (history.length > 20) {
            history = history.slice(-20);
          }

          chrome.storage.local.set({ relevancyHistory: history });
        });

        // If not relevant, tell Bibin to intervene
        if (data.relevant === false) {
          // Send Bibin intervene message
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0] || !tabs[0].id) return;
            chrome.tabs.sendMessage(tabs[0].id, {
              action: "bibinIntervene",
              reason: data.reason,
              topic: session.subject
            });
          });

          // =====================
          // Update local session counters
          // =====================
          const hostname = new URL(url).hostname;
          const updatedSession = { ...session };

          // Increment interventions
          updatedSession.interventions = (updatedSession.interventions || 0) + 1;

          // Add to distraction sites if not already present
          if (!updatedSession.distraction_sites) updatedSession.distraction_sites = [];
          if (!updatedSession.distraction_sites.includes(hostname)) {
            updatedSession.distraction_sites.push(hostname);
          }

          chrome.storage.local.set({ damSession: updatedSession });
        }
        console.log("Relevance check completed successfully");
      } catch (err) {
        console.log("Relevance check failed:", err);
      }
    });
  }

});