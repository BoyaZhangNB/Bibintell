document.getElementById("startSession").addEventListener("click", () => {
  // Reset counters but do NOT set studyActive here
  // Bibin sets it after the user answers the questions
  chrome.storage.local.set({
    studyActive: false, // explicitly false until Bibin confirms
    studySubject: null,
    studyDuration: null,
    interventions: 0,
    distraction_sites: [],
    total_pages: 0,
    relevant_pages: 0,
    studySessionStartTime: Date.now()
  }, () => {
    chrome.runtime.sendMessage({ action: "summonBibin" });
    window.close();
  });
});