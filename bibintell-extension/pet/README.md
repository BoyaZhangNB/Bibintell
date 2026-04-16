# Pet UI logic (pet-container.js)

This document explains what the on-page “Bibin” UI does, what it does not do, and how it interacts with the service worker.

## Responsibilities

The pet UI is intentionally thin. It is responsible for:

- Rendering the floating pet (`#bibintell-pet`) and speech bubble (`#bibin-speech`)
- Running the session-start flow (subject + duration)
- Writing session inputs to extension storage
- Displaying intervention nudges that are generated elsewhere

The pet UI is *not* responsible for:

- Calling `/check_relevance`
- Calling `/nudge`
- Performing any AI reasoning

Those responsibilities live in the MV3 service worker (`background/background.js`).

## Main UI elements

- `pet`: floating character container (`#bibintell-pet`), hidden by default
- `speech`: speech bubble (`#bibin-speech`), hidden by default
- `input`: a text input used during the “subject” and “duration” steps

## How speech is rendered

All bubble content is rendered via:

- `displayMessage(text, showInput = true)`

It:

- plays the conversation animation
- replaces the bubble contents with `text`
- optionally appends the input field
- shows and positions the bubble relative to the pet

## Session-start flow (subject + duration)

Entry point:

- `startFlow()` (triggered when the service worker sends `action: "showBibin"`)

Flow:

1. User clicks “Yes!”
   - sets `input._mode = "subject"`
   - asks the backend to reset any server-side session state via `action: "resetSessionApi"` (best-effort)
2. User enters subject
   - `chrome.storage.local.set({ studySubject: <text> })`
   - switches to duration mode
3. User enters duration
   - `chrome.storage.local.set({ studyDuration: <text>, studyActive: true })`
   - hides the UI shortly after

The service worker watches `studyActive` and starts session timers + monitoring.

## Intervention rendering

When the service worker determines a page is off-task, it sends a message to the tab:

- `action: "bibinIntervene"`

Payload includes:

- `topic`
- `reason`
- `pageTitle`, `pageUrl`
- `nudge` (one sentence)

The UI handler calls `intervene(interventionPayload)` which:

- shows the pet
- displays `nudge` (or a local fallback if `nudge` is missing)
- does not request additional AI content

To clear the UI, the service worker sends:

- `action: "bibinClearIntervention"`

## Hide/Done behavior

`hideBibin()`:

- hides pet + bubble
- sends `{ action: "bibinDone" }` to the service worker so it will not auto-show again in the same browser session
