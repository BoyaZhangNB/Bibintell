// =====================
// Create Pet
// =====================
const pet = document.createElement("div");
pet.id = "bibintell-pet";

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
// Display a message directly (no AI call)
// =====================
function displayMessage(text) {
  speech.innerHTML = `<div>${text}</div>`;
  speech.appendChild(input);
  speech.style.display = "block";
  positionBubble();
  input.focus();
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
// Listen for user input
// =====================
input.addEventListener("keydown", async (e) => {
  if (e.key === "Enter" && input.value.trim() !== "") {
    const userMessage = input.value.trim();
    conversation.push({ role: "user", content: userMessage });
    input.value = "";
    await showSpeech(userMessage);
  }
});

// =====================
// Greet on load
// =====================
window.addEventListener("load", () => {
  displayMessage("Hi! Do you want to start a study session?");
});