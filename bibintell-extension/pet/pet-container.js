
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

initializePetAnimation(img);

pet.appendChild(img);
document.body.appendChild(pet);

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
  chrome.runtime.sendMessage({ action: "bibinDone" });
}

function clearInterventionReminder() {
  if (interventionReminderTimer) {
    clearInterval(interventionReminderTimer);
    interventionReminderTimer = null;
  }
}

function clearInterventionMode(hideUi = true) {
  clearInterventionReminder();
  if (petMode === "intervention") {
    petMode = "idle";
  }
  if (hideUi && pet.style.display === "block") {
    speech.style.display = "none";
    pet.style.display = "none";
  }
}

// Display a message with optional input field
function displayMessage(text, showInput = true) {
  playConversationAnimation();

  speech.innerHTML = "";
  const messageDiv = document.createElement("div");
  messageDiv.textContent = text;
  messageDiv.style.whiteSpace = "pre-wrap";
  speech.appendChild(messageDiv);

  if (showInput) {
    speech.appendChild(input);
    input.focus();
  }
  // If no input, remove it so there's no typing space
  speech.style.display = "block";
  positionBubble();
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
  playConversationAnimation();

  if (input._mode === "subject") {
    input._mode = "duration";

    // Save subject to storage
    chrome.storage.local.set({ studySubject: userMessage });

    displayMessage(`Nice! How long are you planning to study? ⏱️`);
    return;
  }

  if (input._mode === "duration") {
    input._mode = null;

    // Save duration to storage
    chrome.storage.local.set({ studyDuration: userMessage, studyActive: true });

    // No input needed on final message
    displayMessage(`Perfect! I'll let you focus now. Good luck! 🎯`, false);
    setTimeout(() => hideBibin(), 2500);
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
