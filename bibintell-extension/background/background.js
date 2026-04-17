const API = "http://127.0.0.1:8000";
const BACKEND_REQUEST_TIMEOUT_MS = 20000;
const INTERVENTION_REPEAT_MS = 10000;

const DEBUG_EVENTS_KEY = "debugEvents";
const MAX_DEBUG_EVENTS = 200;
// Per-tab intervention state so each distracting tab can escalate independently.
const interventionLoops = new Map();

function logDebug(event, details = {}) {
  const payload = {
    timestamp: Date.now(),
    event,
    details,
  };

  console.log(`[BibinDebug] ${event}`, details);

  chrome.storage.local.get([DEBUG_EVENTS_KEY], (result) => {
    const events = Array.isArray(result[DEBUG_EVENTS_KEY]) ? result[DEBUG_EVENTS_KEY] : [];
    events.push(payload);

    if (events.length > MAX_DEBUG_EVENTS) {
      events.splice(0, events.length - MAX_DEBUG_EVENTS);
    }

    chrome.storage.local.set({ [DEBUG_EVENTS_KEY]: events });
  });
}

function isEligibleUrl(url) {
  if (!url) return false;
  return !(
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:")
  );
}

function isNoResponseExpectedError(errorMessage) {
  return typeof errorMessage === "string" &&
    errorMessage.includes("The message port closed before a response was received.");
}

function isReceiverMissingError(errorMessage) {
  return typeof errorMessage === "string" &&
    errorMessage.includes("Could not establish connection. Receiving end does not exist.");
}

function getActiveTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    callback(tabs && tabs[0] ? tabs[0] : null);
  });
}

function requestShowBibin(tabId, source, options = {}) {
  const force = Boolean(options.force);

  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      logDebug("show_bibin_failed_tab_lookup", {
        source,
        tabId,
        error: chrome.runtime.lastError?.message || "Tab not found",
      });
      return;
    }

    const url = tab.url || "";
    if (!isEligibleUrl(url)) {
      logDebug("show_bibin_skipped_ineligible_url", { source, tabId, url });
      return;
    }

    chrome.storage.session.get(["bibinDone", "bibinShown", "startupIntroPending"], (session) => {
      if (!force && session.bibinDone) {
        logDebug("show_bibin_blocked_done", { source, tabId });
        return;
      }

      if (!force && session.bibinShown) {
        logDebug("show_bibin_blocked_already_shown", { source, tabId });
        return;
      }

      chrome.storage.session.set({ bibinShown: true }, () => {
        chrome.tabs.sendMessage(tabId, { action: "showBibin" }, () => {
          const errorMessage = chrome.runtime.lastError?.message;

          if (errorMessage && !isNoResponseExpectedError(errorMessage)) {
            logDebug("show_bibin_send_failed", {
              source,
              tabId,
              url,
              error: errorMessage,
            });
            chrome.storage.session.set({ bibinShown: false });
            return;
          }

          if (errorMessage && isNoResponseExpectedError(errorMessage)) {
            logDebug("show_bibin_sent_without_ack", { source, tabId, url });
          }

          logDebug("show_bibin_sent", { source, tabId, url, force });
          chrome.storage.session.set({ startupIntroPending: false });
        });
      });
    });
  });
}

function tryShowOnActiveTab(source, options = {}) {
  getActiveTab((tab) => {
    if (!tab?.id) {
      logDebug("show_bibin_no_active_tab", { source });
      return;
    }

    requestShowBibin(tab.id, source, options);
  });
}

function armStartupIntro(source) {
  chrome.storage.session.set(
    {
      bibinDone: false,
      bibinShown: false,
      startupIntroPending: true,
      startupIntroSource: source,
      startupIntroAt: Date.now(),
    },
    () => {
      logDebug("startup_intro_armed", { source });
      tryShowOnActiveTab(`${source}_immediate`);

      [1000, 3000].forEach((delayMs) => {
        setTimeout(() => {
          tryShowOnActiveTab(`${source}_retry_${delayMs}ms`);
        }, delayMs);
      });
    }
  );
}

function buildInterventionPrompt(data) {
  const topic = data.topic || "Unknown topic";
  const pageTitle = data.pageTitle || "Unknown page";
  const pageUrl = data.pageUrl || "";
  const reason = data.llmReason || data.reason || "You seem off-task.";
  const interventions = Number.isInteger(data.interventions) ? data.interventions : 0;
  const totalPages = Number.isInteger(data.totalPages) ? data.totalPages : 0;
  const relevantPages = Number.isInteger(data.relevantPages) ? data.relevantPages : 0;
  const elapsedMins = Number.isInteger(data.elapsedMins) ? data.elapsedMins : 0;
  const reminderCount = Number.isInteger(data.reminderCount) ? data.reminderCount : 0;
  const focusPercent = totalPages > 0 ? Math.round((relevantPages / totalPages) * 100) : 0;

  const toneGuide = reminderCount === 0
    ? "playful and surprised - like catching a friend red-handed, funny beaver pun required"
    : reminderCount <= 2
      ? "disappointed but caring - less humor, more accountability, still one beaver reference"
      : "stern and direct - no jokes, just facts, short and sharp";

  const examplesByTone = reminderCount === 0
    ? `Examples of the right tone:
- "Dam, ${pageTitle} already? You just opened this page ${elapsedMins} minutes in - back to the lodge to study ${topic}."
- "Whoa, a ${pageTitle} detour already? Your ${topic} notes are collecting dust, chew through it."
- "Already drifting to ${pageTitle}? Bibin sees everything. ${topic} is not going to study itself, get back to it."`
    : reminderCount <= 2
      ? `Examples of the right tone:
- "Still on ${pageTitle}? Your ${topic} focus is at ${focusPercent}% and Bibin is not impressed - back to the dam."
- "You have had ${interventions} nudges and you are still on ${pageTitle}? ${topic} is waiting and the dam will not build itself."
- "Bibin believed in you. ${elapsedMins} minutes in and your focus is already leaking - patch it up and get back to ${topic}."
- "This is reminder ${reminderCount + 1}. Every minute here is a minute your ${topic} knowledge stays shallow - swim back."`
      : `Examples of the right tone:
- "${interventions} interventions. Your ${topic} dam is still unfinished. Close this. Now."
- "Bibin is done being nice. ${topic}. ${elapsedMins} minutes wasted. Get back."
- "You have been reminded ${interventions} times. ${topic} is the only page that matters right now."
- "No more jokes. No more puns. ${topic}. Go."`;

  return `Generate one intervention message for a student who is off-task.

Study topic: ${topic}
Current page title: ${pageTitle}
Current page url: ${pageUrl}
Reason off-task: ${reason}
Interventions so far this session: ${interventions}
Minutes elapsed: ${elapsedMins}
Focus percent: ${focusPercent}%
Reminder count on this page: ${reminderCount + 1}
Tone target: ${toneGuide}

${examplesByTone}

Now write ONE intervention message in that exact tone.
Rules:
- Plain text only
- Two sentences max
- Include study topic by name
- Include one metric (focus percent, minutes, or interventions)
- Use page title or URL as a hook if possible
- Never mention exact domain/site name
- No insults
- Sound like Bibin (beaver accountability coach), not a generic assistant`;
}

function getLocalAsync(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

function bumpSessionInterventions() {
  chrome.storage.local.get(["sessionInterventions"], (result) => {
    const current = Number.isInteger(result.sessionInterventions) ? result.sessionInterventions : 0;
    chrome.storage.local.set({ sessionInterventions: current + 1 });
  });
}

function stopInterventionLoop(tabId, reason = "") {
  const state = interventionLoops.get(tabId);
  if (!state) return;

  if (state.timerId) {
    clearInterval(state.timerId);
  }

  interventionLoops.delete(tabId);
  logDebug("intervention_loop_stopped", { tabId, reason });
}

async function dispatchInterventionTick(tabId) {
  const state = interventionLoops.get(tabId);
  if (!state) return;

  if (state.inFlight) {
    logDebug("intervention_tick_skipped_inflight", {
      tabId,
      reminderCount: state.reminderCount,
    });
    return;
  }

  state.inFlight = true;
  try {
    const tab = await new Promise((resolve) => {
      chrome.tabs.get(tabId, (tabData) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(tabData || null);
      });
    });

    // Stop immediately if the tab is gone or cannot host the content script.
    if (!tab || !isEligibleUrl(tab.url || "")) {
      stopInterventionLoop(tabId, "tab_missing_or_ineligible");
      return;
    }

    // If user navigated away from the flagged page, clear UI and end this loop.
    if (state.pageUrl && tab.url !== state.pageUrl) {
      stopInterventionLoop(tabId, "url_changed");
      sendClearIntervention(tabId, "url_changed");
      return;
    }

    const sessionData = await getLocalAsync([
      "studyActive",
      "studySessionStartTime",
      "sessionInterventions",
      "sessionTotalPages",
      "sessionRelevantPages",
    ]);

    if (!sessionData.studyActive) {
      stopInterventionLoop(tabId, "study_inactive");
      return;
    }

    const now = Date.now();
    const startTime = Number.isInteger(sessionData.studySessionStartTime)
      ? sessionData.studySessionStartTime
      : now;
    const elapsedMins = Math.max(0, Math.round((now - startTime) / 60000));

    const interventionData = {
      reason: state.reason,
      topic: state.topic,
      pageTitle: state.pageTitle,
      pageUrl: state.pageUrl,
      llmReason: state.llmReason,
      interventions: sessionData.sessionInterventions || 0,
      totalPages: sessionData.sessionTotalPages || 0,
      relevantPages: sessionData.sessionRelevantPages || 0,
      elapsedMins,
      reminderCount: state.reminderCount,
    };

    // Build a metric-aware prompt so the model can escalate tone over time.
    const prompt = buildInterventionPrompt(interventionData);
    logDebug("intervention_pipeline_prompt_ready", {
      tabId,
      promptLength: prompt.length,
      pageTitle: interventionData.pageTitle || "",
      pageUrl: interventionData.pageUrl || "",
      promptPreview: prompt.slice(0, 220),
      reminderCount: state.reminderCount,
    });

    const nudge = await requestInterventionNudge(prompt, {
      tabId,
      topic: state.topic,
    });

    const finalNudge = nudge || buildInterventionFallback(interventionData);
    logDebug("intervention_pipeline_nudge_ready", {
      tabId,
      source: nudge ? "backend" : "fallback",
      nudgeLength: finalNudge.length,
      reminderCount: state.reminderCount,
    });

    // UI only renders this payload; backend generation already happened above.
    sendIntervene(tabId, {
      ...interventionData,
      nudge: finalNudge,
    });

    bumpSessionInterventions();
    state.reminderCount += 1;

    logDebug("intervention_pipeline_dispatched", {
      tabId,
      topic: state.topic,
      reminderCount: state.reminderCount,
    });
  } finally {
    const latestState = interventionLoops.get(tabId);
    if (latestState) {
      latestState.inFlight = false;
    }
  }
}

function startInterventionLoop(tabId, interventionBase) {
  const existing = interventionLoops.get(tabId);
  const existingSamePage = existing && existing.pageUrl === (interventionBase.pageUrl || "");

  // Avoid stacking multiple timers for the same tab and URL.
  if (existingSamePage) {
    logDebug("intervention_loop_already_active", {
      tabId,
      pageUrl: interventionBase.pageUrl || "",
    });
    return;
  }

  stopInterventionLoop(tabId, "restart");

  interventionLoops.set(tabId, {
    ...interventionBase,
    reminderCount: 0,
    inFlight: false,
    timerId: null,
  });

  logDebug("intervention_loop_started", {
    tabId,
    topic: interventionBase.topic || "",
    pageUrl: interventionBase.pageUrl || "",
    repeatMs: INTERVENTION_REPEAT_MS,
  });

  // First nudge is immediate; follow-up nudges run on interval.
  dispatchInterventionTick(tabId);

  const state = interventionLoops.get(tabId);
  if (!state) return;

  state.timerId = setInterval(() => {
    dispatchInterventionTick(tabId);
  }, INTERVENTION_REPEAT_MS);
}

async function requestInterventionNudge(prompt, context = {}) {
  let timeoutId = null;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), BACKEND_REQUEST_TIMEOUT_MS);

    logDebug("intervention_nudge_call_start", {
      tabId: context.tabId,
      topic: context.topic || "",
      promptLength: (prompt || "").length,
    });

    const response = await fetch(`${API}/nudge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ prompt: prompt || "" }),
    });

    logDebug("intervention_nudge_call_response", {
      tabId: context.tabId,
      status: response.status,
      ok: response.ok,
    });

    if (!response.ok) {
      const text = await response.text();
      logDebug("intervention_nudge_http_error", {
        tabId: context.tabId,
        status: response.status,
        body: text,
      });
      return null;
    }

    logDebug("intervention_nudge_endpoint_ok", {
      tabId: context.tabId,
      status: response.status,
    });

    const data = await response.json();
    const nudge = typeof data?.nudge === "string" ? data.nudge.trim() : "";

    logDebug("intervention_nudge_call_success", {
      tabId: context.tabId,
      hasNudge: Boolean(nudge),
      backendError: data?.error || "",
    });

    return nudge || null;
  } catch (err) {
    logDebug("intervention_nudge_call_failed", {
      tabId: context.tabId,
      error: String(err),
    });
    return null;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

// =====================
// Track active tab title
// =====================
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (!tab) return;
    chrome.storage.local.set({ lastActiveTab: tab.title });
    logDebug("tab_activated", {
      tabId: activeInfo.tabId,
      title: tab.title,
      url: tab.url || "",
    });
  });
});

// =====================
// Study Session Management
// =====================
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.studyActive) {
    const previousState = Boolean(changes.studyActive.oldValue);
    const currentState = Boolean(changes.studyActive.newValue);

    if (previousState === currentState) return;

    logDebug("study_active_changed", {
      previousState,
      currentState,
    });

    if (currentState) {
      chrome.storage.local.set({
        studySessionActive: true,
        studySessionStartTime: Date.now(),
        sessionInterventions: 0,
        sessionDistractionSites: [],
        sessionTotalPages: 0,
        sessionRelevantPages: 0,
      });

      chrome.storage.local.get("studyDuration", (r) => {
        const mins = parseInt(r.studyDuration, 10) || 0;
        logDebug("study_timer_start_requested", { durationMins: mins });
        startSessionTimer(mins);
      });
    } else {
      interventionLoops.forEach((_, tabId) => stopInterventionLoop(tabId, "study_ended"));
      clearSessionTimer();
      endAndLogSession();
    }
  }
});

// =====================
// End + log session to backend
// =====================
function endAndLogSession() {
  chrome.storage.local.get(
    [
      "studySubject",
      "studyDuration",
      "studySessionStartTime",
      "sessionInterventions",
      "sessionDistractionSites",
      "sessionTotalPages",
      "sessionRelevantPages",
    ],
    async (data) => {
      if (!data.studySubject) {
        logDebug("session_end_skipped_no_subject", {});
        return;
      }

      const startTime = data.studySessionStartTime || Date.now();
      const actualMins = Math.round((Date.now() - startTime) / 60000);
      const intendedMins = parseInt(data.studyDuration, 10) || 0;

      try {
        await fetch(`${API}/log-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: data.studySubject || "Unknown",
            intended_duration_mins: intendedMins,
            actual_duration_mins: actualMins,
            interventions: data.sessionInterventions || 0,
            distraction_sites: data.sessionDistractionSites || [],
            total_pages: data.sessionTotalPages || 0,
            relevant_pages: data.sessionRelevantPages || 0,
          }),
        });

        logDebug("session_logged_success", {
          subject: data.studySubject,
          intendedMins,
          actualMins,
        });
      } catch (err) {
        logDebug("session_logged_failed", {
          error: String(err),
        });
      }

      chrome.storage.local.set({
        studySessionActive: false,
        studySessionStartTime: null,
        sessionInterventions: 0,
        sessionDistractionSites: [],
        sessionTotalPages: 0,
        sessionRelevantPages: 0,
      });
    }
  );
}

// =====================
// Browser close = session end
// =====================
chrome.windows.onRemoved.addListener(() => {
  chrome.windows.getAll((windows) => {
    if (windows.length === 0) {
      logDebug("all_windows_closed", {});

      chrome.storage.local.get("studyActive", (result) => {
        if (result.studyActive) {
          chrome.storage.local.set({ studyActive: false });
        }
      });
    }
  });
});

// =====================
// Auto-show Bibin on browser launch
// =====================
chrome.runtime.onStartup.addListener(() => {
  armStartupIntro("onStartup");
});

chrome.runtime.onInstalled.addListener(() => {
  armStartupIntro("onInstalled");

  chrome.storage.local.get(["lumberReserve", "purchasedItems"], (result) => {
    const updates = {};

    if (!Number.isInteger(result.lumberReserve)) {
      updates.lumberReserve = 100;
    }

    if (!result.purchasedItems || typeof result.purchasedItems !== "object") {
      updates.purchasedItems = {};
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });
});

// =====================
// Tab load fallback
// =====================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab?.active) return;

  const url = tab.url || "";
  if (!isEligibleUrl(url)) return;

  requestShowBibin(tabId, "tabs.onUpdated");
});

chrome.tabs.onRemoved.addListener((tabId) => {
  stopInterventionLoop(tabId, "tab_removed");
});

// =====================
// Message handling
// =====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message?.action || "unknown";
  logDebug("runtime_message_received", {
    action,
    fromTabId: sender?.tab?.id,
    fromUrl: sender?.tab?.url || "",
    hasPrompt: typeof message?.prompt === "string",
    hasMessage: typeof message?.message === "string",
  });

  if (message.action === "storeGetLumberReserve") {
    chrome.storage.local.get(["lumberReserve"], (result) => {
      const reserve = Number.isInteger(result.lumberReserve) ? result.lumberReserve : 0;
      sendResponse({ lumberReserve: reserve });
    });
    return true;
  }

  if (message.action === "storeGetPurchasedItems") {
    chrome.storage.local.get(["purchasedItems"], (result) => {
      const purchasedItems =
        result.purchasedItems && typeof result.purchasedItems === "object"
          ? result.purchasedItems
          : {};
      sendResponse({ purchasedItems });
    });
    return true;
  }

  if (message.action === "storePurchaseItem") {
    const item = message.item || {};
    const itemId = item.id;
    const price = parseInt(item.price, 10);

    if (!itemId || !Number.isInteger(price) || price < 0) {
      sendResponse({ success: false, reason: "Invalid item data" });
      return true;
    }

    chrome.storage.local.get(["lumberReserve", "purchasedItems"], (result) => {
      const reserve = Number.isInteger(result.lumberReserve) ? result.lumberReserve : 0;
      const purchasedItems =
        result.purchasedItems && typeof result.purchasedItems === "object"
          ? result.purchasedItems
          : {};

      if (reserve < price) {
        sendResponse({
          success: false,
          reason: "Not enough lumber",
          lumberReserve: reserve,
          purchasedItems,
        });
        return;
      }

      const current = purchasedItems[itemId] || { quantity: 0 };
      purchasedItems[itemId] = {
        id: item.id,
        name: item.name,
        asset: item.asset,
        description: item.description,
        price,
        quantity: (current.quantity || 0) + 1,
        lastPurchasedAt: Date.now(),
      };

      const updatedReserve = reserve - price;

      chrome.storage.local.set(
        {
          lumberReserve: updatedReserve,
          purchasedItems,
        },
        () => {
          sendResponse({
            success: true,
            lumberReserve: updatedReserve,
            purchasedItems,
          });
        }
      );
    });

    return true;
  }

  if (message.action === "contentReady") {
    if (!sender.tab?.id) {
      logDebug("content_ready_missing_tab", {});
      return true;
    }

    logDebug("content_ready", {
      tabId: sender.tab.id,
      url: sender.tab.url || "",
    });

    requestShowBibin(sender.tab.id, "contentReady");
    return true;
  }

  if (message.action === "contentDebugLog") {
    logDebug(message.event || "content_log", {
      fromTabId: sender.tab?.id,
      url: sender.tab?.url || "",
      ...(message.details || {}),
    });
    return true;
  }

  if (message.action === "resetSessionApi") {
    (async () => {
      try {
        const response = await fetch(`${API}/reset_session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          const text = await response.text();
          logDebug("reset_session_http_error", {
            status: response.status,
            body: text,
          });
          sendResponse({ ok: false, error: `HTTP ${response.status}` });
          return;
        }

        sendResponse({ ok: true });
      } catch (err) {
        logDebug("reset_session_failed", { error: String(err) });
        sendResponse({ ok: false, error: String(err) });
      }
    })();

    return true;
  }

  if (message.action === "sessionExpired") {
    tryShowOnActiveTab("sessionExpired", { force: true });
    return true;
  }

  if (message.action === "summonBibin") {
    chrome.storage.session.set(
      {
        bibinDone: false,
        bibinShown: false,
        startupIntroPending: false,
      },
      () => {
        logDebug("summon_requested", {});
        tryShowOnActiveTab("summonBibin", { force: true });
        sendResponse({ ok: true });
      }
    );
    return true;
  }

  if (message.action === "bibinDone") {
    chrome.storage.session.set({ bibinDone: true, bibinShown: false, startupIntroPending: false });
    logDebug("bibin_done_for_session", {});
    return true;
  }

  if (message.action === "bibinDeclined") {
    chrome.storage.session.set({ bibinDone: true, bibinShown: false, startupIntroPending: false });
    chrome.storage.local.set({ lastBibinDecision: "declined", lastBibinDecisionAt: Date.now() });
    logDebug("bibin_declined_for_session", {});
    return true;
  }

  if (message.action === "forceEndSession") {
    chrome.storage.local.get("studyActive", (result) => {
      if (result.studyActive) {
        chrome.storage.local.set({ studyActive: false });
      } else {
        endAndLogSession();
      }

      getActiveTab((tab) => {
        if (tab?.id) {
          sendClearIntervention(tab.id, "session_force_ended");
        }
      });
    });

    sendResponse({ status: "ok" });
    return true;
  }

  // Main decision pipeline entrypoint from content.js page snapshots.
  if (message.action === "checkRelevance") {
    const { title, url, content, reason } = message.data || {};
    const senderTabId = sender.tab?.id;

    chrome.storage.local.get(["studySubject", "studyActive"], async (result) => {
      const topic = result.studySubject;
      if (!topic || !result.studyActive) {
        logDebug("relevance_skipped_session_inactive", {
          topic: topic || "",
          studyActive: Boolean(result.studyActive),
          url: url || "",
          reason: reason || "",
        });

        if (senderTabId) {
          sendClearIntervention(senderTabId, "study_inactive");
        }
        return;
      }

      chrome.storage.local.get("sessionTotalPages", (r) => {
        chrome.storage.local.set({ sessionTotalPages: (r.sessionTotalPages || 0) + 1 });
      });

      try {
        const response = await fetch(`${API}/check_relevance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, title, content, url }),
        });

        if (!response.ok) {
          const text = await response.text();
          logDebug("relevance_http_error", {
            status: response.status,
            body: text,
            url,
          });
          return;
        }

        const data = await response.json();

        let analysis = data.llm_analysis;
        if (typeof analysis === "string") {
          try {
            analysis = JSON.parse(analysis);
          } catch (e) {
            logDebug("relevance_analysis_parse_failed", {
              error: String(e),
              llmAnalysisType: typeof data.llm_analysis,
            });
            return;
          }
        }

        logDebug("relevance_result", {
          relevant: data.relevant,
          reason: data.reason || "",
          pageTitle: title || "",
          url: url || "",
        });

        if (data.relevant === true) {
          chrome.storage.local.get("sessionRelevantPages", (r) => {
            chrome.storage.local.set({ sessionRelevantPages: (r.sessionRelevantPages || 0) + 1 });
          });

          if (senderTabId) {
            sendClearIntervention(senderTabId, "page_relevant");
          }
        }

        chrome.storage.local.get(["relevancyHistory"], (histResult) => {
          let history = histResult.relevancyHistory || [];
          history.push({
            timestamp: Date.now(),
            title,
            url,
            result: { ...data, llm_analysis: analysis },
            topic,
          });
          if (history.length > 20) history = history.slice(-20);
          chrome.storage.local.set({ relevancyHistory: history });
        });

        // For off-task pages, begin per-tab repeating interventions.
        if (data.relevant === false) {
          logDebug("intervention_pipeline_triggered", {
            tabId: senderTabId,
            topic,
            pageTitle: title || "",
          });

          chrome.storage.local.get(["sessionDistractionSites"], (r) => {
            const sites = r.sessionDistractionSites || [];
            try {
              const hostname = new URL(url).hostname;
              if (!sites.includes(hostname)) sites.push(hostname);
            } catch (_) {
              // noop
            }
            chrome.storage.local.set({
              sessionDistractionSites: sites,
            });
          });

          if (!senderTabId) {
            logDebug("intervene_skipped_missing_sender_tab", { url: url || "" });
            return;
          }

          const interventionData = {
            reason: data.reason || "You're drifting from your study topic!",
            topic,
            pageTitle: title || "",
            pageUrl: url || "",
            llmReason: data.reason || "",
          };

          logDebug("intervention_pipeline_context_loaded", {
            tabId: senderTabId,
            topic,
            pageUrl: url || "",
          });

          startInterventionLoop(senderTabId, interventionData);
        }
      } catch (err) {
        logDebug("relevance_request_failed", {
          error: String(err),
          url: url || "",
        });
      }
    });

    return true;
  }

  if (message.action === "debugGetState") {
    chrome.storage.local.get(
      [
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
      ],
      (localData) => {
        chrome.storage.session.get(
          ["bibinDone", "bibinShown", "startupIntroPending", "startupIntroSource", "startupIntroAt"],
          (sessionData) => {
            getActiveTab((tab) => {
              sendResponse({
                ok: true,
                now: Date.now(),
                local: localData,
                session: sessionData,
                activeTab: tab
                  ? {
                      id: tab.id,
                      title: tab.title || "",
                      url: tab.url || "",
                      status: tab.status || "",
                    }
                  : null,
              });
            });
          }
        );
      }
    );
    return true;
  }

  if (message.action === "debugGetEvents") {
    chrome.storage.local.get([DEBUG_EVENTS_KEY], (result) => {
      sendResponse({
        ok: true,
        events: Array.isArray(result[DEBUG_EVENTS_KEY]) ? result[DEBUG_EVENTS_KEY] : [],
      });
    });
    return true;
  }

  if (message.action === "debugClearEvents") {
    chrome.storage.local.set({ [DEBUG_EVENTS_KEY]: [] }, () => {
      logDebug("debug_events_cleared", {});
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.action === "debugForceStartupIntro") {
    armStartupIntro("debugForceStartupIntro");
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === "debugForceShowNow") {
    tryShowOnActiveTab("debugForceShowNow", { force: true });
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === "debugTestIntervene") {
    getActiveTab((tab) => {
      if (!tab?.id || !isEligibleUrl(tab.url || "")) {
        logDebug("debug_test_intervene_skipped", {
          reason: "No eligible active tab",
          url: tab?.url || "",
        });
        sendResponse({ ok: false, reason: "No eligible active tab" });
        return;
      }

      sendIntervene(tab.id, {
        topic: "Debug Topic",
        reason: "Debug intervention test from debugger page.",
      });

      sendResponse({ ok: true });
    });
    return true;
  }

  logDebug("runtime_message_unhandled", {
    action,
    fromTabId: sender?.tab?.id,
    fromUrl: sender?.tab?.url || "",
  });
  return false;
});

// =====================
// Session Timer
// =====================
let studyTimer = null;

function startSessionTimer(durationMins) {
  clearSessionTimer();
  if (!durationMins || durationMins <= 0) {
    logDebug("study_timer_skipped_invalid_duration", { durationMins });
    return;
  }

  const ms = durationMins * 60 * 1000;
  logDebug("study_timer_started", { durationMins });

  studyTimer = setTimeout(() => {
    logDebug("study_timer_expired", {});
    chrome.storage.local.get("studyActive", (result) => {
      if (result.studyActive) {
        tryShowOnActiveTab("studyTimerExpired", { force: true });
        chrome.storage.local.set({ studyActive: false });
      }
    });
  }, ms);
}

function clearSessionTimer() {
  if (studyTimer) {
    clearTimeout(studyTimer);
    studyTimer = null;
    logDebug("study_timer_cleared", {});
  }
}

// =====================
// Retry-based intervene sender
// =====================
function sendIntervene(tabId, data, attempt = 1) {
  logDebug("intervene_attempt", {
    tabId,
    attempt,
    topic: data.topic,
  });

  chrome.tabs.get(tabId, (tab) => {
    const tabLookupError = chrome.runtime.lastError?.message;
    if (tabLookupError || !tab) {
      logDebug("intervene_failed_tab_lookup", {
        tabId,
        attempt,
        error: tabLookupError || "Tab not found",
      });
      return;
    }

    const url = tab.url || "";
    if (!isEligibleUrl(url)) {
      logDebug("intervene_skipped_ineligible_url", {
        tabId,
        attempt,
        url,
      });
      return;
    }

    chrome.tabs.sendMessage(
      tabId,
      {
        action: "bibinIntervene",
        reason: data.reason,
        nudge: data.nudge || "",
        topic: data.topic,
        pageTitle: data.pageTitle || "",
        pageUrl: data.pageUrl || "",
        llmReason: data.llmReason || "",
      },
      () => {
        const errorMessage = chrome.runtime.lastError?.message;

        if (!errorMessage) {
          logDebug("intervene_sent", { tabId, attempt, url });
          return;
        }

        if (isNoResponseExpectedError(errorMessage)) {
          logDebug("intervene_sent_without_ack", { tabId, attempt, url });
          return;
        }

        // Retry when content script is still loading after navigation.
        if (attempt < 3 && isReceiverMissingError(errorMessage)) {
          logDebug("intervene_retry_scheduled", {
            tabId,
            attempt,
            error: errorMessage,
          });
          setTimeout(() => sendIntervene(tabId, data, attempt + 1), 1000 * attempt);
          return;
        }

        logDebug("intervene_failed", {
          tabId,
          attempt,
          error: errorMessage,
          url,
        });
      }
    );
  });
}

function sendClearIntervention(tabId, reason) {
  stopInterventionLoop(tabId, `clear_${reason}`);
  chrome.tabs.sendMessage(tabId, { action: "bibinClearIntervention", reason }, () => {
    const errorMessage = chrome.runtime.lastError?.message;
    if (!errorMessage || isNoResponseExpectedError(errorMessage)) {
      logDebug("clear_intervention_sent", { tabId, reason });
      return;
    }

    logDebug("clear_intervention_failed", {
      tabId,
      reason,
      error: errorMessage,
    });
  });
}
