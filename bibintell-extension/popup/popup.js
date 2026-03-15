// =====================
// Live countdown timer
// =====================
let countdownInterval = null;

function startCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);

  countdownInterval = setInterval(() => {
    chrome.storage.local.get(["studySessionStartTime", "studyDuration", "studyActive"], (data) => {
      if (!data.studyActive || !data.studySessionStartTime) {
        safeSet("total-mins", "–");
        clearInterval(countdownInterval);
        return;
      }

      const durationMs = (parseInt(data.studyDuration) || 0) * 60 * 1000;
      const elapsed = Date.now() - data.studySessionStartTime;
      const remaining = durationMs - elapsed;

      if (remaining <= 0) {
        safeSet("total-mins", "0:00");
        clearInterval(countdownInterval);
        return;
      }

      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      safeSet("total-mins", `${mins}:${secs.toString().padStart(2, "0")}`);
    });
  }, 1000);
}
// =====================
// Modular stats loader — safe to extend without touching other logic
// =====================
async function loadStats() {
  chrome.storage.local.get(
    ["streak", "totalMins", "sessionInterventions", "studySubject", "studyActive"],
    (data) => {
      safeSet("live-interventions", data.sessionInterventions ?? "–");

      // Status pill
      const pill = document.getElementById("statusPill");
      if (data.studyActive) {
        pill.textContent = "● Studying";
        pill.classList.add("active");
        startCountdown();
      } else {
        pill.textContent = "● Idle";
        pill.classList.remove("active");
        clearInterval(countdownInterval);
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
  try {
    const res = await fetch("http://127.0.0.1:8000/user-stats");
    const data = await res.json();
    safeSet("streak", data.streak ?? "–");
  } catch (err) {
    console.log("Could not load stats from API:", err);
    safeSet("streak", "–");
  }
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
  // ✅ Send message to background — more reliable than setting storage directly
  chrome.runtime.sendMessage({ action: "forceEndSession" }, () => {
    loadStats();
  });
});
// =====================
// Open stats page (stub — replace URL when page is ready)
// =====================
document.getElementById("openStats").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("stats/stats.html") });
});

document.getElementById("openStore").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("store/store.html") });
});

// =====================
// Debug console
// =====================
document.getElementById("openDebugger").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("debugger/debugger.html") });
});

// =====================
// Init
// =====================
loadStats();