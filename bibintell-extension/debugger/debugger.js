const API_BASE = "http://127.0.0.1:8000";

let lastState = null;

document.addEventListener("DOMContentLoaded", () => {
  loadDebugData();
  startElapsedTimer();

  document.getElementById("refreshBtn").addEventListener("click", loadDebugData);
});

function sendRuntimeMessage(payload) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Runtime message timed out"));
    }, 3000);

    chrome.runtime.sendMessage(payload, (response) => {
      clearTimeout(timeoutId);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response || {});
    });
  });
}

function storageGetLocal(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

function storageGetSession(keys) {
  return new Promise((resolve) => {
    chrome.storage.session.get(keys, (result) => resolve(result || {}));
  });
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0] ? tabs[0] : null;
      resolve(
        tab
          ? {
              id: tab.id,
              title: tab.title || "",
              url: tab.url || "",
              status: tab.status || "",
            }
          : null
      );
    });
  });
}

async function loadDebugData() {
  await loadRuntimeState();
  await Promise.all([loadBackendStatus(), loadRelevancyHistory(), loadEventLog()]);
  updateTimestamp();
}

async function loadRuntimeState() {
  try {
    const [localData, sessionData, activeTabData] = await Promise.all([
      storageGetLocal([
        "studySubject",
        "studyDuration",
        "studyActive",
        "studySessionActive",
        "studySessionStartTime",
        "sessionInterventions",
        "sessionDistractionSites",
        "sessionTotalPages",
        "sessionRelevantPages",
        "lastActiveTab",
        "lastBibinDecision",
        "lastBibinDecisionAt",
        "relevancyHistory",
      ]),
      storageGetSession(["bibinDone", "bibinShown", "startupIntroPending", "startupIntroSource", "startupIntroAt"]),
      getActiveTab(),
    ]);

    const data = {
      ok: true,
      now: Date.now(),
      local: localData,
      session: sessionData,
      activeTab: activeTabData,
    };
    lastState = data;

    const local = data.local || {};
    const session = data.session || {};
    const activeTab = data.activeTab || null;

    const studyActive = Boolean(local.studySessionActive || local.studyActive);

    safeSet("studyTopic", local.studySubject || "No active study session");
    setBadge("sessionStatus", studyActive ? "Active" : "Inactive", studyActive);
    safeSet("totalDuration", local.studyDuration ? `${local.studyDuration} min` : "-");

    safeSet("totalPages", String(local.sessionTotalPages || 0));
    safeSet("relevantPages", String(local.sessionRelevantPages || 0));
    safeSet("interventions", String(local.sessionInterventions || 0));

    const distractionSites = Array.isArray(local.sessionDistractionSites) ? local.sessionDistractionSites : [];
    safeSet("distractionSites", distractionSites.length ? distractionSites.join(", ") : "None");

    safeSet("activeTab", activeTab?.title || "No active tab");
    safeSet("activeUrl", activeTab?.url || "-");

    safeSet("bibinDone", String(Boolean(session.bibinDone)));
    safeSet("bibinShown", String(Boolean(session.bibinShown)));
    safeSet("startupIntroPending", String(Boolean(session.startupIntroPending)));
    safeSet("startupIntroSource", session.startupIntroSource || "-");

    const decisionText = local.lastBibinDecision
      ? `${local.lastBibinDecision} @ ${new Date(local.lastBibinDecisionAt || Date.now()).toLocaleTimeString()}`
      : "-";
    safeSet("lastDecision", decisionText);
    safeSet("lastActiveTab", local.lastActiveTab || "-");

    updateElapsedTime();
  } catch (error) {
    console.error("Failed to load runtime state:", error);
  }
}

async function loadBackendStatus() {
  const reachabilityEl = document.getElementById("backendReachability");
  const messageEl = document.getElementById("backendMessage");

  try {
    const response = await fetch(`${API_BASE}/debug_status`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    setBadge("backendReachability", "Online", true);
    messageEl.textContent = data.message || "No message";
  } catch (error) {
    setBadge("backendReachability", "Offline", false);
    messageEl.textContent = String(error);
  }
}

async function loadRelevancyHistory() {
  const state = lastState?.local || {};
  const history = Array.isArray(state.relevancyHistory) ? state.relevancyHistory : [];
  const container = document.getElementById("relevancyHistory");

  if (!history.length) {
    container.innerHTML = '<p class="no-data">No history available</p>';
    return;
  }

  const rows = [...history].reverse().slice(0, 12).map((item) => {
    const result = item.result || {};
    const relevant = result.relevant;
    const css = relevant === true ? "relevant" : relevant === false ? "not-relevant" : "neutral";
    const verdict = relevant === true ? "Relevant" : relevant === false ? "Not Relevant" : "Unknown";
    const reason = result.reason || "No reason provided";

    return `
      <div class="history-item ${css}">
        <div class="history-header">
          <div class="history-title" title="${escapeHtml(item.title || "(no title)")}">${escapeHtml(item.title || "(no title)")}</div>
          <div class="history-score">${verdict}</div>
        </div>
        <div class="history-url" title="${escapeHtml(item.url || "")}">${escapeHtml(item.url || "")}</div>
        <div class="history-reason">${escapeHtml(reason)}</div>
        <div class="history-time">Checked at ${new Date(item.timestamp || Date.now()).toLocaleTimeString()}</div>
      </div>
    `;
  });

  container.innerHTML = rows.join("");
}

async function loadEventLog() {
  const container = document.getElementById("eventLog");

  try {
    const localData = await storageGetLocal(["debugEvents"]);
    const events = Array.isArray(localData.debugEvents) ? localData.debugEvents : [];

    if (!events.length) {
      container.innerHTML = '<p class="no-data">No events captured yet</p>';
      return;
    }

    const rows = [...events].reverse().slice(0, 60).map((item) => {
      const details = item.details ? escapeHtml(JSON.stringify(item.details)) : "{}";
      return `
        <div class="history-item neutral">
          <div class="history-header">
            <div class="history-title">${escapeHtml(item.event || "unknown_event")}</div>
            <div class="history-score">${new Date(item.timestamp || Date.now()).toLocaleTimeString()}</div>
          </div>
          <div class="history-reason mono">${details}</div>
        </div>
      `;
    });

    container.innerHTML = rows.join("");
  } catch (error) {
    container.innerHTML = `<p class="no-data">Failed to load event log: ${escapeHtml(String(error))}</p>`;
  }
}

function updateElapsedTime() {
  const local = lastState?.local || {};
  const isActive = Boolean(local.studySessionActive || local.studyActive);
  const startTime = local.studySessionStartTime;

  if (!isActive || !startTime) {
    safeSet("elapsedTime", "-");
    return;
  }

  const elapsed = Date.now() - startTime;
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  safeSet("elapsedTime", `${mins}m ${secs}s`);
}

function startElapsedTimer() {
  setInterval(() => {
    updateElapsedTime();
  }, 1000);
}

function updateTimestamp() {
  safeSet("lastUpdate", new Date().toLocaleTimeString());
}

function setBadge(id, text, active) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `value status-badge ${active ? "active" : "inactive"}`;
}

function safeSet(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
