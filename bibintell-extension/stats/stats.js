const API = "http://127.0.0.1:8000";

// ─────────────────────────────────────────
// Skeleton loading state
// ─────────────────────────────────────────
function showSkeletons() {
  ["stat-streak", "stat-mins", "stat-nudges", "stat-distraction"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("skeleton");
  });
}

function hideSkeletons() {
  ["stat-streak", "stat-mins", "stat-nudges", "stat-distraction"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("skeleton");
  });
}

// ─────────────────────────────────────────
// Load hero stats from /user-stats
// ─────────────────────────────────────────
async function loadHeroStats() {
  showSkeletons();
  try {
    const res = await fetch(`${API}/user-stats`);
    const data = await res.json();

    document.getElementById("stat-streak").textContent     = data.streak ?? "0";
    document.getElementById("stat-mins").textContent       = data.total_study_mins ?? "0";
    document.getElementById("stat-nudges").textContent     = data.total_interventions ?? "0";
    document.getElementById("stat-distraction").textContent = data.top_distraction ?? "None";

  } catch (err) {
    console.error("Failed to load stats:", err);
    ["stat-streak","stat-mins","stat-nudges","stat-distraction"].forEach(id => {
      document.getElementById(id).textContent = "—";
    });
  } finally {
    hideSkeletons();
  }
}

// ─────────────────────────────────────────
// Load session history from Supabase via API
// ─────────────────────────────────────────
async function loadSessionHistory() {
  try {
    const res = await fetch(`${API}/session-history`);
    const data = await res.json();
    const sessions = data.sessions || [];

    const badge = document.getElementById("sessionCount");
    badge.textContent = `${sessions.length} session${sessions.length !== 1 ? "s" : ""}`;

    const tbody = document.getElementById("sessionBody");
    const empty = document.getElementById("emptyState");

    if (sessions.length === 0) {
      tbody.closest("table").classList.add("hidden");
      empty.classList.remove("hidden");
      return;
    }

    // Sort newest first
    sessions.sort((a, b) => new Date(b.session_date) - new Date(a.session_date));

    tbody.innerHTML = sessions.map(s => {
      const focusPct = s.total_pages > 0
        ? Math.round((s.relevant_pages / s.total_pages) * 100)
        : 0;

      const dateStr = new Date(s.session_date).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric"
      });

      return `
        <tr>
          <td><span style="font-family:'DM Mono',monospace;font-size:12px;color:var(--muted)">${dateStr}</span></td>
          <td><span class="subject-chip">${escHtml(s.subject)}</span></td>
          <td><span style="font-family:'DM Mono',monospace">${s.intended_duration_mins}m</span></td>
          <td><span style="font-family:'DM Mono',monospace">${s.actual_duration_mins}m</span></td>
          <td><span style="font-family:'DM Mono',monospace;color:${s.interventions > 3 ? 'var(--danger)' : 'var(--text)'}">${s.interventions}</span></td>
          <td>
            <div class="focus-bar">
              <div class="focus-track">
                <div class="focus-fill" style="width:${focusPct}%"></div>
              </div>
              <span class="focus-pct">${focusPct}%</span>
            </div>
          </td>
        </tr>
      `;
    }).join("");

  } catch (err) {
    console.error("Failed to load session history:", err);
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─────────────────────────────────────────
// Init
// ─────────────────────────────────────────
loadHeroStats();
loadSessionHistory();