// Debugger JavaScript
const API_BASE = "http://127.0.0.1:8000";

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  loadDebugData();
  startTimer();

  // Refresh button
  document.getElementById('refreshBtn').addEventListener('click', loadDebugData);
});

// Load all debug data
async function loadDebugData() {
  await Promise.all([
    loadStudySession(),
    loadBackendStats(),
    loadRelevancyHistory()
  ]);

  updateTimestamp();
}

// Load study session info from chrome storage
async function loadStudySession() {
  chrome.storage.local.get([
    'studySubject',
    'studyDuration',
    'studySessionActive',
    'studySessionStartTime'
  ], (result) => {
    // Study topic
    const topicEl = document.getElementById('studyTopic');
    topicEl.textContent = result.studySubject || 'No active study session';

    // Session status
    const statusEl = document.getElementById('sessionStatus');
    const isActive = result.studySessionActive || false;
    statusEl.textContent = isActive ? 'Active' : 'Inactive';
    statusEl.className = 'value status-badge ' + (isActive ? 'active' : 'inactive');

    // Total duration
    const durationEl = document.getElementById('totalDuration');
    if (result.studyDuration) {
      durationEl.textContent = result.studyDuration + ' min';
    } else {
      durationEl.textContent = '-';
    }

    // Elapsed time (will be updated by timer)
    updateElapsedTime(result.studySessionStartTime, isActive);
  });
}

// Load backend statistics
async function loadBackendStats() {
  try {
    const response = await fetch(`${API_BASE}/debug_status`);
    const data = await response.json();

    // History length
    document.getElementById('historyLength').textContent = data.history_length || 0;

    // Vector store size
    document.getElementById('vectorStoreSize').textContent = data.vector_store_size || 0;

    // Drift detected
    const driftEl = document.getElementById('driftDetected');
    const hasDrift = data.drift_detected || false;
    driftEl.textContent = hasDrift ? 'Yes' : 'No';
    driftEl.className = 'value status-badge ' + (hasDrift ? 'inactive' : 'active');

    // Recent average
    const avgEl = document.getElementById('recentAverage');
    if (data.recent_average !== null && data.recent_average !== undefined) {
      avgEl.textContent = data.recent_average.toFixed(3);
    } else {
      avgEl.textContent = '-';
    }

    // Draw similarity chart
    drawSimilarityChart(data.similarity_history || []);

  } catch (error) {
    console.error('Failed to load backend stats:', error);
    document.getElementById('historyLength').textContent = 'Error';
    document.getElementById('vectorStoreSize').textContent = 'Error';
    document.getElementById('driftDetected').textContent = 'Error';
    document.getElementById('recentAverage').textContent = 'Error';
  }
}

// Load relevancy history from chrome storage
async function loadRelevancyHistory() {
  chrome.storage.local.get(['relevancyHistory'], (result) => {
    const history = result.relevancyHistory || [];
    const container = document.getElementById('relevancyHistory');

    if (history.length === 0) {
      container.innerHTML = '<p class="no-data">No history available</p>';
      return;
    }

    // Reverse to show most recent first
    const reversedHistory = [...history].reverse();

    container.innerHTML = reversedHistory.slice(0, 10).map(item => {
      const time = new Date(item.timestamp).toLocaleTimeString();
      const result = item.result;

      // Determine relevancy status
      let relevancyClass = 'neutral';
      let score = '-';
      let reason = 'No reason provided';

      if (result.relevant === true) {
        relevancyClass = 'relevant';
        score = result.confidence?.toFixed(3) || '-';
        reason = result.reason || 'Relevant to study topic';
      } else if (result.relevant === false) {
        relevancyClass = 'not-relevant';
        score = result.confidence?.toFixed(3) || '-';
        reason = result.reason || 'Not relevant to study topic';
      } else if (result.similarity_score !== undefined) {
        score = result.similarity_score.toFixed(3);
        if (result.llm_analysis) {
          reason = JSON.stringify(result.llm_analysis);
        }
      }

      return `
        <div class="history-item ${relevancyClass}">
          <div class="history-header">
            <div class="history-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
            <div class="history-score">Score: ${score}</div>
          </div>
          <div class="history-url" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</div>
          <div class="history-reason">${escapeHtml(reason)}</div>
          <div class="history-time">Checked at ${time}</div>
        </div>
      `;
    }).join('');
  });
}

// Draw similarity score chart
function drawSimilarityChart(scores) {
  const container = document.getElementById('similarityChart');

  if (!scores || scores.length === 0) {
    container.innerHTML = '<p class="no-data">No data available</p>';
    return;
  }

  // Take last 30 scores or all if less
  const recentScores = scores.slice(-30);
  const maxHeight = 180; // pixels

  container.innerHTML = recentScores.map((score, index) => {
    const height = Math.max(score * maxHeight, 5); // Minimum 5px for visibility
    const color = score > 0.8 ? '#28a745' : score > 0.5 ? '#ffc107' : '#dc3545';
    return `
      <div class="chart-bar"
           style="height: ${height}px; background: ${color};"
           data-value="${score.toFixed(3)}"
           title="Score ${index + 1}: ${score.toFixed(3)}">
      </div>
    `;
  }).join('');
}

// Update elapsed time
function updateElapsedTime(startTime, isActive) {
  const elapsedEl = document.getElementById('elapsedTime');

  if (!isActive || !startTime) {
    elapsedEl.textContent = '-';
    return;
  }

  const elapsed = Date.now() - startTime;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);

  elapsedEl.textContent = `${minutes}m ${seconds}s`;
}

// Start timer to update elapsed time every second
function startTimer() {
  setInterval(() => {
    chrome.storage.local.get(['studySessionStartTime', 'studySessionActive'], (result) => {
      if (result.studySessionActive && result.studySessionStartTime) {
        updateElapsedTime(result.studySessionStartTime, true);
      }
    });
  }, 1000);
}

// Update timestamp
function updateTimestamp() {
  document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
