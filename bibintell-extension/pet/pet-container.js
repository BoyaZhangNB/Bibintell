
// UI layer only: renders Bibin and collects subject/duration.
// Relevance checks and nudge generation are handled in background.js.
// Create Pet (hidden by default)
const pet = document.createElement("div");
pet.id = "bibintell-pet";
pet.style.display = "none";

const img = document.createElement("img");
img.src = chrome.runtime.getURL("bibin_assets/Bibin_BGRemoved.png");
img.alt = "Bibintell";
img.style.width = "200px";

const {
  initializePetAnimation,
  setPetIdleFrame,
  playPetAnimation,
  playConversationAnimation,
} = window.BibinPetAnimation;

pet.appendChild(img);
document.body.appendChild(pet);
initializePetAnimation(img);

// speech bubble
const speech = document.createElement("div");
speech.id = "bibin-speech";
speech.style.display = "none";

const input = document.createElement("input");
input.type = "text";
input.placeholder = "Type your reply...";

speech.appendChild(input);
document.body.appendChild(speech);


// Drag & Drop
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let petStartX = 0;
let petStartY = 0;

pet.addEventListener('mousedown', (e) => {
  isDragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  const rect = pet.getBoundingClientRect();
  petStartX = rect.left;
  petStartY = rect.top;
  pet.style.cursor = 'grabbing';
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const deltaX = e.clientX - dragStartX;
  const deltaY = e.clientY - dragStartY;
  pet.style.left = `${petStartX + deltaX}px`;
  pet.style.top = `${petStartY + deltaY}px`;

  if (speech.style.display === "block") {
    positionBubble();
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    pet.style.cursor = 'pointer';
  }
});

// Session + intervention state
let petMode = "idle";
let interventionReminderTimer = null;
let activeMessageStreamToken = 0;

const MESSAGE_STREAM_TARGET_MS = 3000;
const STREAM_MIN_DELAY_MS = 20;
const STREAM_MAX_DELAY_MS = 120;
const STREAM_PUNCTUATION_BONUS_MS = 55;
const CONVERSATION_ANIMATION_DURATION_MS = 5000;

function sendRuntimeMessage(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response || {});
    });
  });
}


// Position bubble above pet
function positionBubble() {
  const rect = pet.getBoundingClientRect();
  const bubbleWidth = speech.offsetWidth || 220;
  speech.style.left = `${rect.left + rect.width / 2 - bubbleWidth / 2}px`;
  speech.style.top = `${rect.top - speech.offsetHeight - 16}px`;
}


// Hide Bibin permanently until summoned again
function hideBibin() {
  petMode = "idle";
  clearInterventionReminder();
  speech.style.display = "none";
  pet.style.display = "none";
  // Signals the service worker to avoid auto-showing again in this browser session.
  chrome.runtime.sendMessage({ action: "bibinDone" });
}

function clearInterventionReminder() {
  if (interventionReminderTimer) {
    clearInterval(interventionReminderTimer);
    interventionReminderTimer = null;
  }
}

function clearInterventionMode(hideUi = true) {
  // Invalidate any active typewriter effect before hiding or switching modes.
  activeMessageStreamToken += 1;
  clearInterventionReminder();
  if (petMode === "intervention") {
    petMode = "idle";
  }
  if (hideUi && pet.style.display === "block") {
    speech.style.display = "none";
    pet.style.display = "none";
  }
}

function streamTextIntoNode(targetNode, fullText, token, onComplete) {
  let index = 0;
  const safeLength = Math.max(1, fullText.length);
  const baseDelay = Math.min(
    STREAM_MAX_DELAY_MS,
    Math.max(STREAM_MIN_DELAY_MS, Math.round(MESSAGE_STREAM_TARGET_MS / safeLength))
  );

  const tick = () => {
    if (token !== activeMessageStreamToken) {
      return;
    }

    index += 1;
    targetNode.textContent = fullText.slice(0, index);
    positionBubble();

    if (index >= fullText.length) {
      if (typeof onComplete === "function") {
        onComplete();
      }
      return;
    }

    const previousChar = fullText[index - 1] || "";
    const delay = /[.!?,]/.test(previousChar)
      ? baseDelay + STREAM_PUNCTUATION_BONUS_MS
      : baseDelay;

    setTimeout(tick, delay);
  };

  tick();
}

// Display a message with optional input field
function displayMessage(text, showInput = true, options = {}) {
  activeMessageStreamToken += 1;
  const streamToken = activeMessageStreamToken;
  const messageText = String(text || "");
  const stream = options.stream !== false;

  playConversationAnimation({
    durationMs: CONVERSATION_ANIMATION_DURATION_MS,
  });

  speech.innerHTML = "";
  const messageDiv = document.createElement("div");
  messageDiv.textContent = "";
  messageDiv.style.whiteSpace = "pre-wrap";
  speech.appendChild(messageDiv);

  speech.style.display = "block";
  positionBubble();

  const finishRender = () => {
    if (streamToken !== activeMessageStreamToken) {
      return;
    }

    if (showInput) {
      speech.appendChild(input);
      input.focus();
    }

    positionBubble();
  };

  if (!stream || messageText.length <= 1) {
    messageDiv.textContent = messageText;
    finishRender();
    return;
  }

  streamTextIntoNode(messageDiv, messageText, streamToken, finishRender);
}


// Show Yes/No flow
function startFlow() {
  clearInterventionMode(false);
  petMode = "intro";
  pet.style.display = "block";
  pet.style.bottom = "20px";
  pet.style.right = "20px";
  pet.style.left = "";
  pet.style.top = "";

  playPetAnimation("appearing", {
    durationMs: 2000,
    onComplete: setPetIdleFrame,
  });

  speech.innerHTML = `<div>Let's build a strong study dam today. Ready to start working? 📖</div>`;

  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.gap = "8px";
  btnRow.style.marginTop = "8px";

  const yesBtn = document.createElement("button");
  yesBtn.textContent = "Yes!";
  yesBtn.style.cssText = `
    flex: 1; padding: 5px; background: #4caf50; color: white;
    border: none; border-radius: 8px; cursor: pointer; font-size: 13px;
  `;

  const noBtn = document.createElement("button");
  noBtn.textContent = "Not now";
  noBtn.style.cssText = `
    flex: 1; padding: 5px; background: #f44336; color: white;
    border: none; border-radius: 8px; cursor: pointer; font-size: 13px;
  `;

  yesBtn.addEventListener("click", () => {
    input._mode = "subject";
    // Best-effort backend reset for a clean session start.
    sendRuntimeMessage({ action: "resetSessionApi" }).catch((err) => {
      console.log("Reset failed:", err);
    });

    displayMessage("What subject are we tackling? 📚");
  });

  noBtn.addEventListener("click", () => {
    // No input needed — user is done
    displayMessage("Okay, good luck! Come back if you need me. 👋", false);
    chrome.runtime.sendMessage({ action: "bibinDeclined" });
    chrome.storage.local.set({ studyActive: false });
    setTimeout(() => hideBibin(), 2000);
  });

  btnRow.appendChild(yesBtn);
  btnRow.appendChild(noBtn);
  speech.appendChild(btnRow);
  speech.style.display = "block";
  positionBubble();
}


// Input handler
input.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter" || input.value.trim() === "") return;

  const userMessage = input.value.trim();
  input.value = "";

  if (input._mode === "subject") {
    input._mode = "duration";

    // Save subject to storage
    chrome.storage.local.set({ studySubject: userMessage });

    displayMessage(`Nice! How long are you planning to study? ⏱️`);
    return;
  }

  if (input._mode === "duration") {
    input._mode = null;

    // Setting studyActive=true is the handoff that starts monitoring in background.js.
    chrome.storage.local.set({ studyDuration: userMessage, studyActive: true });

    // No input needed on final message
    displayMessage(`Perfect! I'll let you focus now. Good luck! 🎯`, false);
    setTimeout(() => hideBibin(), 5000);
    return;
  }
});


// Listen for summon message from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let handled = false;

  if (message.action === "showBibin") {
    startFlow();
    handled = true;
  } else if (message.action === "animateBibin" && message.animation) {
    playPetAnimation(message.animation, {
      durationMs: 2000,
      onComplete: setPetIdleFrame,
    });
    handled = true;
  }

  if (message.action === "bibinIntervene") {
    intervene(message);
    handled = true;
  }

  if (message.action === "bibinClearIntervention") {
    clearInterventionMode(true);
    handled = true;
  }

  if (handled) {
    sendResponse({ ok: true });
    return true;
  }

  return false;
});


// Intervention flow
function intervene(interventionPayload) {
  const topic = interventionPayload?.topic || "Unknown topic";
  const reason = interventionPayload?.reason || "You seem to be drifting from your topic.";
  const pageTitle = interventionPayload?.pageTitle || document.title || "Unknown page";
  const nudge = typeof interventionPayload?.nudge === "string" ? interventionPayload.nudge.trim() : "";

  chrome.storage.local.get(["studyActive"], (result) => {
    if (!result.studyActive) {
      return;
    }

    petMode = "intervention";
    pet.style.display = "block";
    pet.style.bottom = "20px";
    pet.style.right = "20px";
    pet.style.left = "";
    pet.style.top = "";

    // Service worker sends a generated nudge. This fallback is only for transport/API failures.
    const fallback = `${topic} is waiting. You're on ${pageTitle}. ${reason}`;
    displayMessage(nudge || fallback, false);
  });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== "local") return;

  if (changes.studyActive && !changes.studyActive.newValue) {
    clearInterventionMode(true);
  }
});
