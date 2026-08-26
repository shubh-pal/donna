# Development notes

This is **Phase 1 of N** in building Donna, an AI personal assistant
mobile app. Each phase is scoped tightly and committed/pushed
incrementally to `main`.

## Phase 1 (this phase) — App shell & authentication

- Scaffolded with the React Native CLI TypeScript template (bare
  workflow — not Expo Go) so native modules (audio capture, background
  tasks, etc.) can be added freely in later phases without an eject step.
- React Navigation `native-stack` with an auth stack (Login, Signup,
  Forgot Password) and an app stack (Home, Settings), switched by
  Firebase auth state via `AuthContext`.
- Firebase Authentication through the Firebase **JS SDK** (`firebase`
  package), not `@react-native-firebase`. This was the deliberate choice
  for Phase 1:
  - No native config files (`google-services.json` /
    `GoogleService-Info.plist`) or native linking required to get
    email/password + Google auth working — matches the `.env`-driven
    config approach asked for in this phase.
  - Google Sign-In still needs one native module
    (`@react-native-google-signin/google-signin`) to get an ID token on
    device, which is then exchanged for a Firebase credential via
    `signInWithCredential`.
  - If a later phase needs deeper native Firebase integration (Cloud
    Messaging, Crashlytics, etc.), revisit whether to migrate to
    `@react-native-firebase` — the two SDKs can coexist but shouldn't
    both own auth state at once.
- Session persistence uses `initializeAuth` with
  `getReactNativePersistence(AsyncStorage)`. Note: the public
  `firebase/auth` TypeScript declarations don't surface this function
  (it lives in the package's `"react-native"` export condition, which
  Metro resolves correctly at runtime but which the "types" condition
  in `firebase`'s own `package.json` doesn't point to). Restored via a
  small module augmentation in `src/types/firebase-auth-rn.d.ts` — see
  the comment there if this trips up a future upgrade.
- Config: `react-native-dotenv` (babel plugin) maps `.env` → the `@env`
  module, typed in `src/types/env.d.ts`. `.env` is git-ignored;
  `.env.example` documents every variable and where to find it (see
  README.md Setup).
- Testing: the Firebase JS SDK's ESM chain (`@firebase/util`'s
  `postinstall.mjs`) doesn't parse under Jest, so the App smoke test
  mocks `src/config/authService` instead of importing real Firebase.
  AsyncStorage and Google Sign-In also have lightweight mocks in
  `jest/setup.ts` for when later tests exercise `authService` directly.

## Phase 2 — Settings build-out & foreground conversation mode

Scope: the Gemini API key + privacy/permission settings, and a
hold-to-talk conversation screen using Gemini's Live API. Explicitly
**not** in scope (Phase 3 instead): always-on/ambient listening,
Bluetooth-gated wake behavior.

### Gemini API key storage

- `src/config/apiKeyStore.ts` stores the key via `react-native-keychain`
  (iOS Keychain / Android Keystore) under a dedicated `service` name,
  not `AsyncStorage` and not a file. `accessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`
  so it never migrates to a new device/backup. Saving first tries
  `securityLevel: SECURE_HARDWARE` (Android) and falls back to the
  library's default if the device has no hardware-backed keystore —
  some older/lower-end Android devices don't, and failing to save the
  key at all would be worse than a softer guarantee.
- `src/config/geminiRest.ts` validates a key with a real
  `GET .../v1beta/models` call (small `pageSize=1`) before it's saved,
  called directly from the device — see Settings' privacy copy, which
  is accurate: the key is never sent to any server this app controls,
  because there isn't one.

### Conversation mode: Gemini Live API

- `src/config/geminiLive.ts` implements the client side of Google's
  **BidiGenerateContent** WebSocket protocol
  (`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`).
  Checked against Google's current docs
  (https://ai.google.dev/gemini-api/docs/live-api,
  https://ai.google.dev/api/live) at implementation time (Aug 2026):
  - Model: `models/gemini-3.1-flash-live-preview` — Google's current
    quickstart example model. This is a fast-moving preview surface;
    Google has already sunset older `gemini-2.0-flash-live-*` variants
    once, so if this model 404s or gets rejected, check
    https://ai.google.dev/gemini-api/docs/live-api for the current
    recommended one and update `GEMINI_LIVE_MODEL`.
  - Mic audio in: 16-bit PCM, mono, 16kHz, base64 in
    `realtimeInput.audio.data` with `mimeType: "audio/pcm;rate=16000"`.
  - Audio out: same shape via `serverContent.modelTurn.parts[].inlineData`,
    but the sample rate is read from the mime type Google actually sends
    rather than assumed (`sampleRateFromMimeType` in `pcmAudio.ts`) — I
    believe it's 24kHz based on prior Gemini Live documentation, but
    didn't want to hardcode a guess into the parsing path.
  - Push-to-talk turn boundaries: `realtimeInput.audioStreamEnd: true`
    sent on button release, rather than relying only on the API's
    automatic voice-activity detection.
  - `inputAudioTranscription`/`outputAudioTranscription` requested in
    the setup message so the UI has a live transcript of both sides.
  - `parseLiveServerMessage`/`buildSetupMessage`/etc. are pure functions
    and unit tested; `GeminiLiveSession` (the actual WebSocket shell)
    is not, since it has no meaningful logic beyond wiring those pure
    functions to `WebSocket` events.
- **Persona**: `DONNA_SYSTEM_PROMPT` in the same file — sharp, witty,
  dry, unflappable, extremely competent, has your back, kept concise
  and conversational rather than formal. Sent as `systemInstruction` in
  the setup message.
- **Mic capture**: `src/audio/micStreamer.ts` wraps
  `react-native-live-audio-stream`, which streams base64 PCM chunks via
  a `'data'` event — a good fit since it hands back exactly the format
  Gemini Live wants, unlike record-to-file libraries. Its native module
  is a singleton with no listener-removal API, so `init`/`on` are only
  called once per `MicStreamer` instance rather than on every
  start/stop cycle (documented in the file — an easy bug to introduce
  by mistake).
- **Playback**: `src/audio/playbackQueue.ts` + `src/audio/pcmAudio.ts`.
  react-native-sound (and most RN audio players) play *files*, not a
  raw PCM stream, so each response chunk is wrapped in a WAV header,
  written to a temp file, and played sequentially. **Known tradeoff**:
  this means a small gap between chunks rather than gapless streaming
  playback — fine for a first pass, but worth revisiting with a true
  low-latency native audio pipeline if it sounds choppy on a real
  device. `pcmAudio.ts`'s WAV-wrapping is pure/dependency-free (uses
  the `buffer` npm package rather than a native module) specifically so
  it could be unit tested without mocking hardware.
- **Library choice caveat**: `react-native-live-audio-stream` and
  `react-native-sound` are both established but not under especially
  active development. They were picked because they do exactly the one
  thing each is needed for (raw PCM mic chunks; simple file playback)
  with a small API surface, not because they're the only options —
  `react-native-audio-pcm-stream` or a small custom native module would
  be reasonable alternatives if either shows compatibility issues with
  RN 0.87's architecture on a real build.

### Settings additions

- "Save conversation history" toggle (`src/config/preferences.ts`,
  `AsyncStorage`), **off by default**. Phase 2 doesn't yet persist any
  transcript to disk regardless of this setting — the Conversation
  screen's transcript is in-memory/per-session only — so right now the
  toggle is a preference stub for a future phase to honor, plus the
  privacy-note trigger point. That's called out so it isn't mistaken
  for "history is being saved somewhere already."
- Permission status rows (`src/hooks/usePermissionStatuses.ts`,
  `react-native-permissions`) for microphone, Bluetooth, and
  notifications. **Permission requesting is best-effort/unverified**:
  the `request`/`requestNotifications` calls are implemented against
  react-native-permissions' documented API, but this sandbox has no
  real device to confirm the OS prompts actually appear and resolve as
  expected — only `check`/`checkNotifications` (reading current status)
  has any real signal behind it, and even that was only checked against
  library docs, not exercised on-device. Bluetooth/notifications aren't
  used for anything functional yet (mic is the only permission
  Conversation mode actually needs) — they're surfaced now because
  Phase 3's ambient mode will need them, and to catch manifest/plist
  wiring issues early rather than discovering them mid-Phase-3.

### What hasn't been verified (be aware before relying on this)

This sandbox has no microphone, no way to open a real Gemini Live
websocket session, and no Android/iOS device or emulator. Everything
above is implemented to match Google's documented API and the relevant
libraries' documented behavior, and every piece pure enough to unit
test without real hardware/network has a test (key storage round-trips,
key-validation response handling, WAV header correctness byte-by-byte,
Live API message parsing/building). What is **not** covered by any test
here and needs a real device pass:

- Does the app actually build and launch with these new native modules
  linked, under RN 0.87's architecture?
- Does a real Gemini Live session connect, and does the message schema
  in `geminiLive.ts` match what the API actually sends back (model
  name, `responseModalities` placement, output sample rate)?
- Does mic capture → playback sound right (latency, the
  file-per-chunk playback gap noted above, volume/routing)?
- Do the OS permission prompts for microphone/Bluetooth/notifications
  actually appear and resolve the way `usePermissionStatuses.ts`
  expects?

## What's coming next

- **Phase 3 (planned): Ambient background listening mode** — always-on
  or wake-word-triggered listening so Donna can respond without an
  explicit "start conversation" action, gated on a connected Bluetooth
  device (per the original project brief), plus the background-task
  work that the bare-workflow choice in Phase 1 was made to support.
  The permission-status plumbing and Bluetooth manifest/plist entries
  added in Phase 2 are there specifically so Phase 3 can build on them
  rather than starting from scratch.

Scope for that phase is intentionally not started here.
