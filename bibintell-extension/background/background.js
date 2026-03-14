// Track the active tab title (your existing code)
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    console.log("Active tab:", tab.title);
    chrome.storage.local.set({
      lastActiveTab: tab.title
    });
  });
});

// =====================
// Auto-show Bibin on fresh browser launch
// =====================
chrome.runtime.onStartup.addListener(() => {
  // Explicitly clear everything so previous session's state doesn't bleed in
  chrome.storage.session.clear(() => {
    chrome.storage.session.set({ bibinDone: false, bibinShown: false });
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.session.clear(() => {
    chrome.storage.session.set({ bibinDone: false, bibinShown: false });
  });
});

// Wait for a tab to fully finish loading
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
// Listen for messages from content script and popup
// =====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === "summonBibin") {
    chrome.storage.session.set({ bibinDone: false, bibinShown: true });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
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

});