chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {

    console.log("Active tab:", tab.title);

    chrome.storage.local.set({
      lastActiveTab: tab.title
    });

  });
});