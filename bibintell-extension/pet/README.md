# Pet Speech and Conversation Logic

This document summarizes how speech is displayed and generated in `pet-container.js`, and where user input is stored.

## 1) Main UI Elements

- `pet`: the floating character container (`#bibintell-pet`), initially hidden.
- `speech`: the speech bubble container (`#bibin-speech`), initially hidden.
- `input`: text input used for user replies.

## 2) How Speech Is Displayed

All speech bubble text is rendered through:

- `displayMessage(text, showInput = true)`

What it does:

- Plays conversation animation.
- Replaces speech bubble content with `text`.
- Optionally appends the input box.
- Shows and repositions the bubble.

## 3) Two Speech Sources

### A. Hardcoded/scripted lines (local strings)

These are fixed strings directly in `pet-container.js`, such as:

- Initial prompt in `startFlow()`.
- Subject and duration prompts after button/input steps.
- Fallback messages when errors occur.

### B. AI-generated lines (backend response)

The file sends requests to the local backend endpoint:

- `POST http://127.0.0.1:8000/chat`

Used in:

- `showSpeech(userMessage)`
- `showSpeechWithContext(prompt)`

The reply is read from `data.reply` and shown via `displayMessage(...)`.

## 4) Conversation State Flow

In-memory conversation history is stored in:

- `let conversation = []`

Flow details:

- Reset to empty in `startFlow()`.
- User entries are pushed in the input handler (subject/duration modes):
  - `{ role: "user", content: userMessage }`
- AI entries are pushed in `showSpeech(...)`:
  - `{ role: "bibin", content: reply }`
- The conversation array is sent to `/chat` as `history`.

Note: `conversation` is not persisted to extension storage; it only lives in memory for the current interaction.

## 5) Input Modes and Interaction Steps

`input._mode` controls stage transitions:

- `"subject"` -> expects study subject.
- `"duration"` -> expects study duration.
- `"intervention"` -> set after contextual intervention message.

Primary flow:

1. `startFlow()` shows pet + Yes/No buttons.
2. Yes:
   - sets mode to `subject`
   - calls `/reset_session`
   - asks for subject
3. Subject entered:
   - stores subject
   - moves mode to `duration`
   - asks for duration
4. Duration entered:
   - stores duration
   - shows final message
   - hides pet shortly after

## 6) Where User Input Is Stored

User input is stored in Chrome local extension storage:

- Subject:
  - `chrome.storage.local.set({ studySubject: userMessage })`
- Duration:
  - `chrome.storage.local.set({ studyDuration: userMessage })`

Storage location summary:

- Persistent (extension local storage): `studySubject`, `studyDuration`
- Temporary (in-memory JS variable): `conversation`

## 7) Intervention Flow

When `bibinIntervene` is received:

- `intervene(topic, reason)` shows the pet if currently hidden.
- Sends a custom contextual prompt to `/chat` via `showSpeechWithContext(...)`.
- Displays AI-generated nudge.
- Sets `input._mode = "intervention"` for follow-up user response handling.

## 8) Hide/Done Behavior

`hideBibin()`:

- Hides speech and pet.
- Sends runtime message `{ action: "bibinDone" }` to background script.
