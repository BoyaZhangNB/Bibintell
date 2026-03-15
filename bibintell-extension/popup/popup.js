// =====================
// Modular stats loader — safe to extend without touching other logic
// =====================
function loadStats() {
  chrome.storage.local.get(
    ["streak", "totalMins", "sessionInterventions", "studySubject", "studyActive"],
    (data) => {
      // Each stat is independent — missing values show "–" gracefully
      safeSet("streak", data.streak ?? "–");
      safeSet("total-mins", data.totalMins ?? "–");
      safeSet("live-interventions", data.sessionInterventions ?? "–");

      // Status pill
      const pill = document.getElementById("statusPill");
      if (data.studyActive) {
        pill.textContent = "● Studying";
        pill.classList.add("active");
      } else {
        pill.textContent = "● Idle";
        pill.classList.remove("active");
      }

      // Session card
      const card = document.getElementById("sessionCard");
      const subjectEl = document.getElementById("current-subject");
      if (data.studyActive && data.studySubject) {
        subjectEl.textContent = data.studySubject;
        card.classList.remove("hidden");
      } else {
        card.classList.add("hidden");
      }
    }
  );
}

function safeSet(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// =====================
// Summon Bibin
// =====================
document.getElementById("summonBibin").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "summonBibin" });
  window.close();
});

// =====================
// End session
// =====================
document.getElementById("endSession").addEventListener("click", () => {
  chrome.storage.local.set({ studyActive: false, studySubject: null });
  chrome.runtime.sendMessage({ action: "bibinDone" });
  loadStats();
});

// =====================
// Open stats page (stub — replace URL when page is ready)
// =====================
document.getElementById("openStats").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("stats.html") });
});

// =====================
// Debug console
// =====================
document.getElementById("openDebugger").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("debugger.html") });
});

// =====================
// Init
// =====================
loadStats();