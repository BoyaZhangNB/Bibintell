document.addEventListener("DOMContentLoaded", () => {
  // 1. Fetch Stats from FastAPI/Supabase when popup opens
  fetch("http://127.0.0.1:8000/user-stats")
    .then(res => res.json())
    .then(data => {
      document.getElementById("streak").innerText = data.streak || 0;
      document.getElementById("total-mins").innerText = data.total_study_mins || 0;
      document.getElementById("top-distraction").innerText = data.top_distraction || "None";
    }).catch(err => console.error("Stats Error:", err));

  // 2. Check if a session is currently running to swap the UI
  chrome.storage.local.get(["studyActive", "studySubject", "interventions"], (res) => {
    if (res.studyActive) {
      document.getElementById("stats-view").classList.add("hidden");
      document.getElementById("active-view").classList.remove("hidden");
      document.getElementById("current-subject").innerText = res.studySubject;
      document.getElementById("live-interventions").innerText = res.interventions || 0;
    }
  });
});

// 3. START SESSION
document.getElementById("startSession").addEventListener("click", () => {
  const subject = document.getElementById("subjectInput").value || "General Study";
  
  // Set studyActive to TRUE so background.js starts tracking!
  chrome.storage.local.set({
    studyActive: true, 
    studySubject: subject,
    interventions: 0,
    distraction_sites: [],
    total_pages: 0,
    relevant_pages: 0,
    studySessionStartTime: Date.now()
  }, () => {
    window.close();
  });
});

// 4. END SESSION & SAVE TO DATABASE
document.getElementById("endSession").addEventListener("click", () => {
  chrome.storage.local.get(null, (res) => {
    const actual_duration = Math.floor((Date.now() - res.studySessionStartTime) / 60000);

    const payload = {
      subject: res.studySubject || "Unknown",
      intended_duration_mins: actual_duration + 5, // Faking intended duration for demo
      actual_duration_mins: actual_duration,
      interventions: res.interventions || 0,
      distraction_sites: res.distraction_sites || [],
      total_pages: res.total_pages || 0,
      relevant_pages: res.relevant_pages || 0
    };

    fetch("http://127.0.0.1:8000/log-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(() => {
      // Clear session and close popup
      chrome.storage.local.set({ studyActive: false }, () => window.close());
    });
  });
});