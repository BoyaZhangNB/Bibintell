// =====================
// Create Pet (hidden by default)
// =====================
const pet = document.createElement("div");
pet.id = "bibintell-pet";
pet.style.display = "none";

const img = document.createElement("img");
img.src = chrome.runtime.getURL("bibin_assets/Bibin_BGRemoved.png");
img.alt = "Bibintell";
img.style.width = "200px";

pet.appendChild(img);
document.body.appendChild(pet);

// =====================
// Speech Bubble
// =====================
const speech = document.createElement("div");
speech.id = "bibin-speech";
speech.style.display = "none";

const input = document.createElement("input");
input.type = "text";
input.placeholder = "Type your reply...";

speech.appendChild(input);
document.body.appendChild(speech);

// =====================
// Drag & Drop
// =====================
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

// =====================
// Conversation History
// =====================
let conversation = [];

// =====================
// Position bubble above pet
// =====================
function positionBubble() {
  const rect = pet.getBoundingClientRect();
  const bubbleWidth = speech.offsetWidth || 220;
  speech.style.left = `${rect.left + rect.width / 2 - bubbleWidth / 2}px`;
  speech.style.top = `${rect.top - speech.offsetHeight - 16}px`;
}

// =====================
// Hide Bibin permanently until summoned again
// =====================
function hideBibin() {
  speech.style.display = "none";
  pet.style.display = "none";
  chrome.runtime.sendMessage({ action: "bibinDone" });
}

// =====================
// Display a message with optional input field
// =====================
function displayMessage(text, showInput = true) {
  speech.innerHTML = `<div>${text}</div>`;
  if (showInput) {
    speech.appendChild(input);
    input.focus();
  }
  // If no input, remove it so there's no typing space
  speech.style.display = "block";
  positionBubble();
}

// =====================
// Get AI reply and display it
// =====================
async function showSpeech(userMessage) {
  try {
    const response = await fetch("http://127.0.0.1:8000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: userMessage,
        history: conversation
      }),
    });
    const data = await response.json();
    const reply = data.reply;
    conversation.push({ role: "bibin", content: reply });
    displayMessage(reply);
  } catch (err) {
    displayMessage("Oops! I can't connect right now. Is the server running?");
    console.error("Bibin fetch error:", err);
  }
}

// =====================
// Show Yes/No flow
// =====================
function startFlow() {
  pet.style.display = "block";
  pet.style.bottom = "20px";
  pet.style.right = "20px";
  pet.style.left = "";
  pet.style.top = "";
  conversation = [];

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
    fetch("http://127.0.0.1:8000/reset_session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }).catch(err => console.log("Reset failed:", err));

    displayMessage("What subject are we tackling? 📚");
  });

  noBtn.addEventListener("click", () => {
    // No input needed — user is done
    displayMessage("Okay, good luck! Come back if you need me. 👋", false);
    setTimeout(() => hideBibin(), 2000);
  });

  btnRow.appendChild(yesBtn);
  btnRow.appendChild(noBtn);
  speech.appendChild(btnRow);
  speech.style.display = "block";
  positionBubble();
}

// =====================
// Input handler
// =====================
input.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter" || input.value.trim() === "") return;

  const userMessage = input.value.trim();
  input.value = "";

  if (input._mode === "subject") {
    input._mode = "duration";
    conversation.push({ role: "user", content: userMessage });

    // Save subject to storage
    chrome.storage.local.set({ studySubject: userMessage });

    displayMessage(`Nice! How long are you planning to study? ⏱️`);
    return;
  }

  if (input._mode === "duration") {
    input._mode = null;
    conversation.push({ role: "user", content: userMessage });

    // Save duration to storage
    chrome.storage.local.set({ studyDuration: userMessage });

    // No input needed on final message
    displayMessage(`Perfect! I'll let you focus now. Good luck! 🎯`, false);
    setTimeout(() => hideBibin(), 2500);
    return;
  }
});

// =====================
// Listen for summon message from background
// =====================
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "showBibin") {
    startFlow();
  }

  if (message.action === "bibinIntervene") {
    intervene(message.topic, message.reason);
  }
});

// =====================
// Intervention flow
// =====================
function intervene(topic, reason) {
  // Don't interrupt if Bibin is already visible
  if (pet.style.display === "block") return;

  pet.style.display = "block";
  pet.style.bottom = "20px";
  pet.style.right = "20px";
  pet.style.left = "";
  pet.style.top = "";

  // Use AI to generate a contextual nudge
  showSpeechWithContext(
    `The user is supposed to be studying "${topic}" but is on an unrelated page. Give a short, friendly nudge to get them back on track. Max 2 sentences.`
  );
}

// =====================
// Get AI reply with a custom prompt (no user history needed)
// =====================
async function showSpeechWithContext(prompt) {
  try {
    const response = await fetch("http://127.0.0.1:8000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: prompt,
        history: []
      }),
    });
    const data = await response.json();
    displayMessage(data.reply, true);

    // Set input mode so user can respond to Bibin
    input._mode = "intervention";
  } catch (err) {
    displayMessage("Hey! Shouldn't you be studying? 👀", false);
    setTimeout(() => hideBibin(), 3000);
  }
}