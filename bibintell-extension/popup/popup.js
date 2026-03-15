// Elements
const statsView = document.getElementById("statsView");
const activeView = document.getElementById("activeSessionView");

const startBtn = document.getElementById("startSession");
const endBtn = document.getElementById("endSession");

const subjectInput = document.getElementById("subjectInput");
const durationInput = document.getElementById("durationInput");

const streakEl = document.getElementById("streak");
const totalTimeEl = document.getElementById("totalTime");
const topDistractionEl = document.getElementById("topDistraction");
const activeSubjectEl = document.getElementById("activeSubject");

const API_BASE = "http://127.0.0.1:8000";


// -----------------------------
// Check if session exists
// -----------------------------
document.addEventListener("DOMContentLoaded", async () => {

  chrome.storage.local.get("damSession", async (data) => {

    if (data.damSession) {
      showActiveSession(data.damSession);
    } else {
      showStatsView();
      await loadStats();
    }

  });

});


// -----------------------------
// Load user stats
// -----------------------------
async function loadStats() {

  try {

    const res = await fetch(`${API_BASE}/user-stats`);
    const stats = await res.json();

    streakEl.textContent = stats.streak;
    totalTimeEl.textContent = stats.total_study_mins + " mins";
    topDistractionEl.textContent = stats.top_distraction;

  } catch (err) {
    console.error("Failed to fetch stats", err);
  }

}


// -----------------------------
// Start Dam Session
// -----------------------------
startBtn.addEventListener("click", () => {

  const subject = subjectInput.value || "General Study";
  const intended = parseInt(durationInput.value) || 60;

  const session = {
    subject: subject,
    intended_duration_mins: intended,
    startTime: Date.now(),

    interventions: 0,
    distraction_sites: [],
    total_pages: 0,
    relevant_pages: 0
  };

  chrome.storage.local.set({ damSession: session });

  chrome.runtime.sendMessage({ action: "summonBibin" });

  showActiveSession(session);

});


// -----------------------------
// End Dam Session
// -----------------------------
endBtn.addEventListener("click", () => {

  chrome.storage.local.get("damSession", async (data) => {

    const session = data.damSession;

    if (!session) return;

    const actualDuration =
      Math.floor((Date.now() - session.startTime) / 60000);

    const payload = {

      subject: session.subject,
      intended_duration_mins: session.intended_duration_mins,
      actual_duration_mins: actualDuration,

      interventions: session.interventions,
      distraction_sites: session.distraction_sites,

      total_pages: session.total_pages,
      relevant_pages: session.relevant_pages
    };

    try {

      await fetch(`${API_BASE}/log-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

    } catch (err) {
      console.error("Failed to log session", err);
    }

    chrome.storage.local.remove("damSession");

    window.close();

  });

});


// -----------------------------
// UI helpers
// -----------------------------
function showActiveSession(session) {

  statsView.style.display = "none";
  activeView.style.display = "block";

  activeSubjectEl.textContent = session.subject;

}

function showStatsView() {

  statsView.style.display = "block";
  activeView.style.display = "none";

}
  window.close();
});

document.getElementById("openDebugger").addEventListener("click", () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("debugger/debugger.html")
  });
  window.close();
});
