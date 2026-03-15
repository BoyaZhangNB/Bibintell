// Track active tab title
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (!tab) return;
    chrome.storage.local.set({ lastActiveTab: tab.title });
  });
});

// Startup — reset session flags
function resetSessionFlags() {
  chrome.storage.session.clear(() => {
    chrome.storage.session.set({ bibinDone: false, bibinShown: false });
  });
}

chrome.runtime.onStartup.addListener(resetSessionFlags);
chrome.runtime.onInstalled.addListener(resetSessionFlags);

// Show Bibin on first tab that fully loads after browser launch
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

// Study session state management
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.studyActive) {
    const isActive = Boolean(changes.studyActive.newValue);
    chrome.storage.local.set({
      studySessionActive: isActive,
      studySessionStartTime: isActive ? Date.now() : null
    });
  }
});

// Main message hub
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === "summonBibin") {
    chrome.storage.session.set({ bibinDone: false, bibinShown: true });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "showBibin" }, (response) => {
          if (chrome.runtime.lastError) {
            console.log("Could not summon Bibin:", chrome.runtime.lastError.message);
          }
        });
      }
    });
  }

  if (message.action === "bibinDone") {
    chrome.storage.session.set({ bibinDone: true, bibinShown: false });
  }

  if (message.action === "checkRelevance") {
    const { title, url, content } = message.data;

    // Save the sender tab id NOW before any async calls lose it
    const senderTabId = sender.tab ? sender.tab.id : null;

    chrome.storage.local.get(["studySubject", "studyActive"], async (result) => {
      if (!result.studyActive || !result.studySubject) {
        console.log("No active session, skipping relevance check");
        return;
      }

      const topic = result.studySubject;

      // Track total pages
      chrome.storage.local.get("total_pages", (d) => {
        chrome.storage.local.set({ total_pages: (d.total_pages || 0) + 1 });
      });

      try {
        const response = await fetch("http://127.0.0.1:8000/check_relevance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, title, content, url })
        });

        const data = await response.json();
        console.log("Relevance result:", data);

        if (data.relevant) {
          chrome.storage.local.get("relevant_pages", (d) => {
            chrome.storage.local.set({ relevant_pages: (d.relevant_pages || 0) + 1 });
          });
        } else {
          // Track distractions
          chrome.storage.local.get(["interventions", "distraction_sites"], (res) => {
            const list = res.distraction_sites || [];
            try { list.push(new URL(url).hostname); } catch(e) { list.push("unknown"); }
            chrome.storage.local.set({
              interventions: (res.interventions || 0) + 1,
              distraction_sites: list
            });
          });

          // Use saved tab id OR fall back to querying active tab
          const sendIntervention = (tabId) => {
            chrome.tabs.sendMessage(tabId, {
              action: "bibinIntervene",
              reason: data.reason,
              topic
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.log("Intervention failed:", chrome.runtime.lastError.message);
              }
            });
          };

          if (senderTabId) {
            sendIntervention(senderTabId);
          } else {
            // Fallback — query active tab
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0]) sendIntervention(tabs[0].id);
            });
          }
        }

      } catch (err) {
        console.error("Relevance check failed:", err);
      }
    });
  }
});