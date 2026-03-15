const API = "http://127.0.0.1:8000";

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
      // Session starting — initialise all tracking keys
      chrome.storage.local.set({
        studySessionActive: true,
        studySessionStartTime: Date.now(),
        sessionInterventions: 0,
        sessionDistractionSites: [],
        sessionTotalPages: 0,
        sessionRelevantPages: 0
      });
      // ✅ Start timer using studyDuration
      chrome.storage.local.get("studyDuration", (r) => {
        const mins = parseInt(r.studyDuration) || 0;
        startSessionTimer(mins);
      });
    } else {
      // Session ending — log it then clean up
      clearSessionTimer(); // ✅ cancel timer if session ended early
      endAndLogSession();
    }
  }
});


// =====================
// End + log session to backend
// =====================
function endAndLogSession() {
  chrome.storage.local.get([
    "studySubject",
    "studyDuration",
    "studySessionStartTime",
    "sessionInterventions",
    "sessionDistractionSites",
    "sessionTotalPages",
    "sessionRelevantPages"
  ], async (data) => {
    if (!data.studySubject) return;

    const startTime    = data.studySessionStartTime || Date.now();
    const actualMins   = Math.round((Date.now() - startTime) / 60000);
    const intendedMins = parseInt(data.studyDuration) || 0;

    try {
      await fetch(`${API}/log-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject:                data.studySubject || "Unknown",
          intended_duration_mins: intendedMins,
          actual_duration_mins:   actualMins,
          interventions:          data.sessionInterventions || 0,
          distraction_sites:      data.sessionDistractionSites || [],
          total_pages:            data.sessionTotalPages || 0,
          relevant_pages:         data.sessionRelevantPages || 0
        })
      });
      console.log("Session logged successfully ✅");
    } catch (err) {
      console.log("Session log failed:", err);
    }

    // Clean up session tracking keys
    chrome.storage.local.set({
      studySessionActive: false,
      studySessionStartTime: null,
      sessionInterventions: 0,
      sessionDistractionSites: [],
      sessionTotalPages: 0,
      sessionRelevantPages: 0
    });
  });
}

// =====================
// Browser close = session end
// =====================
chrome.windows.onRemoved.addListener(() => {
  chrome.windows.getAll((windows) => {
    if (windows.length === 0) {
      chrome.storage.local.get("studyActive", (result) => {
        if (result.studyActive) {
          // Setting studyActive false triggers endAndLogSession via onChanged above
          chrome.storage.local.set({ studyActive: false });
        }
      });
    }
  });
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
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["lumberReserve", "purchasedItems"], (result) => {
    const updates = {};

    if (!Number.isInteger(result.lumberReserve)) {
      updates.lumberReserve = 100;
    }

    if (!result.purchasedItems || typeof result.purchasedItems !== "object") {
      updates.purchasedItems = {};
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });
});

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

  if (message.action === "storeGetLumberReserve") {
    chrome.storage.local.get(["lumberReserve"], (result) => {
      const reserve = Number.isInteger(result.lumberReserve) ? result.lumberReserve : 0;
      sendResponse({ lumberReserve: reserve });
    });
    return true;
  }

  if (message.action === "storeGetPurchasedItems") {
    chrome.storage.local.get(["purchasedItems"], (result) => {
      const purchasedItems = result.purchasedItems && typeof result.purchasedItems === "object"
        ? result.purchasedItems
        : {};
      sendResponse({ purchasedItems });
    });
    return true;
  }

  if (message.action === "storePurchaseItem") {
    const item = message.item || {};
    const itemId = item.id;
    const price = parseInt(item.price, 10);

    if (!itemId || !Number.isInteger(price) || price < 0) {
      sendResponse({ success: false, reason: "Invalid item data" });
      return true;
    }

    chrome.storage.local.get(["lumberReserve", "purchasedItems"], (result) => {
      const reserve = Number.isInteger(result.lumberReserve) ? result.lumberReserve : 0;
      const purchasedItems = result.purchasedItems && typeof result.purchasedItems === "object"
        ? result.purchasedItems
        : {};

      if (reserve < price) {
        sendResponse({
          success: false,
          reason: "Not enough lumber",
          lumberReserve: reserve,
          purchasedItems
        });
        return;
      }

      const current = purchasedItems[itemId] || { quantity: 0 };
      purchasedItems[itemId] = {
        id: item.id,
        name: item.name,
        asset: item.asset,
        description: item.description,
        price,
        quantity: (current.quantity || 0) + 1,
        lastPurchasedAt: Date.now()
      };

      const updatedReserve = reserve - price;

      chrome.storage.local.set(
        {
          lumberReserve: updatedReserve,
          purchasedItems
        },
        () => {
          sendResponse({
            success: true,
            lumberReserve: updatedReserve,
            purchasedItems
          });
        }
      );
    });

    return true;
  }

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
  if (message.action === "sessionExpired") {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0] || !tabs[0].id) return;
    const url = tabs[0].url || "";
    if (
      url.startsWith("chrome://") ||
      url.startsWith("chrome-extension://") ||
      url.startsWith("about:") ||
      url === ""
    ) {
      console.log("Cannot show session expired on this page:", url);
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { action: "showBibin" }, (response) => {
      if (chrome.runtime.lastError) {
        console.log("Could not send sessionExpired:", chrome.runtime.lastError.message);
      }
    });
  });
}

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

  if (message.action === "bibinDone") {
    chrome.storage.session.set({ bibinDone: true, bibinShown: false });
  }
  if (message.action === "forceEndSession") {
  chrome.storage.local.get("studyActive", (result) => {
    if (result.studyActive) {
      chrome.storage.local.set({ studyActive: false });
      // onChanged will fire endAndLogSession automatically
    } else {
      // Already inactive — just clean up
      endAndLogSession();
    }
  });
  sendResponse({ status: "ok" });
}

  if (message.action === "checkRelevance") {
    const { title, url, content } = message.data;
    const senderTabId = sender.tab?.id;

    chrome.storage.local.get(["studySubject", "studyActive"], async (result) => {
      const topic = result.studySubject;
      if (!topic || !result.studyActive) {
        console.log("Skipping relevance check — no active session");
        return;
      }

      // Track total pages seen this session
      chrome.storage.local.get("sessionTotalPages", (r) => {
        chrome.storage.local.set({ sessionTotalPages: (r.sessionTotalPages || 0) + 1 });
      });

      try {
        const response = await fetch("http://127.0.0.1:8000/check_relevance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, title, content, url })
        });

        const data = await response.json();
        console.log("Relevance result:", data);

        let analysis = data.llm_analysis;
        if (typeof analysis === "string") {
          try { analysis = JSON.parse(analysis); }
          catch (e) { console.log("Failed to parse llm_analysis:", e); return; }
        }

        console.log("drift_detected:", data.drift_detected, "| relevant:", analysis?.relevant);

        // Track relevant pages
        if (analysis?.relevant === true) {
          chrome.storage.local.get("sessionRelevantPages", (r) => {
            chrome.storage.local.set({ sessionRelevantPages: (r.sessionRelevantPages || 0) + 1 });
          });
        }

        // Store relevancy history
        chrome.storage.local.get(["relevancyHistory"], (histResult) => {
          let history = histResult.relevancyHistory || [];
          history.push({ timestamp: Date.now(), title, url, result: { ...data, llm_analysis: analysis }, topic });
          if (history.length > 20) history = history.slice(-20);
          chrome.storage.local.set({ relevancyHistory: history });
        });

        if (analysis?.relevant === false) {
          // Track intervention + distraction site
          chrome.storage.local.get(["sessionInterventions", "sessionDistractionSites"], (r) => {
            const sites = r.sessionDistractionSites || [];
            try {
              const hostname = new URL(url).hostname;
              if (!sites.includes(hostname)) sites.push(hostname);
            } catch (_) {}
            chrome.storage.local.set({
              sessionInterventions: (r.sessionInterventions || 0) + 1,
              sessionDistractionSites: sites
            });
          });

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

  return true;
});

// =====================
// Session Timer
// =====================
let studyTimer = null;

function startSessionTimer(durationMins) {
  clearSessionTimer(); // clear any existing timer
  if (!durationMins || durationMins <= 0) return;

  const ms = durationMins * 60 * 1000;
  console.log(`Session timer started: ${durationMins} mins`);

  studyTimer = setTimeout(() => {
    console.log("Session timer expired — ending session");
    chrome.storage.local.get("studyActive", (result) => {
      if (result.studyActive) {
        // Notify the active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "sessionExpired" });
          }
        });
        // End the session
        chrome.storage.local.set({ studyActive: false });
      }
    });
  }, ms);
}

function clearSessionTimer() {
  if (studyTimer) {
    clearTimeout(studyTimer);
    studyTimer = null;
  }
}

