# Development notes

Donna, an AI personal assistant mobile app, was built in **three
phases**, each scoped tightly and committed/pushed incrementally to
`main`. Phase 3 (below) is the last planned phase — see its "What a
human must verify" section and README.md "What a human needs to do
next" for exactly what's left before this is a real, shippable app.

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

## Phase 3 (final phase) — Ambient background listening mode

Scope: always-on background listening so Donna can respond without an
explicit "start conversation" action, hard-gated so she may only ever
speak out loud through a connected Bluetooth device — never the phone's
own speaker — plus the persistent listening indicator, kill switch, and
one-time confirmation dialog the brief specifically asked for. Built on
top of Phase 2's permission-status plumbing and Bluetooth manifest/plist
entries, which existed specifically to make this phase possible.

This phase was built across two work sessions in this sandbox; the first
session committed and pushed the safety-critical logic and both native
platforms' capture code (Bluetooth-route gating, ambient
preferences + confirmation dialog, `src/native/ambientAudio.ts`, the
Android foreground service, the iOS native module) before hitting its
usage limit mid-edit on `geminiLive.ts`. The second session verified the
working tree was clean (no partial edit had actually landed — the
interrupted edit never made it to disk) and built the remaining
orchestration layer described below from there.

### The layers, bottom to top

- **`src/audio/audioRoute.ts`** (from the first session): the single
  source of truth for "is a Bluetooth output connected right now?" —
  `isBluetoothOutputActive` / `canDonnaSpeakThroughThisRoute`. Pure,
  dependency-free, fails closed on anything malformed or unrecognized.
  Unit tested.
- **`src/config/ambientLive.ts`**: the ambient persona
  (`AMBIENT_SYSTEM_PROMPT`), the client-enforced silence convention
  (`AMBIENT_SILENCE_TOKEN` / `shouldSuppressAmbientReply` — from the
  first session), and `shouldPlayAmbientTurn` (added in the second
  session), which combines that content gate with the Bluetooth gate
  above into the one question the orchestration layer asks per turn.
  All pure, all unit tested.
- **`src/config/geminiLive.ts`**: `GeminiLiveSession` (Phase 2) gained
  one small change — its constructor now takes an optional setup-message
  builder (defaulting to `buildSetupMessage`, Phase 2's hold-to-talk
  persona), so ambient mode can pass `buildAmbientSetupMessage` and reuse
  the exact same websocket session shell (connect/send/parse/close)
  rather than forking the class. This was the edit the first session was
  mid-way through when it was cut off; it landed cleanly in the second
  session with no trace of the interrupted attempt left in the working
  tree.
- **`src/native/ambientAudio.ts`** (first session) /
  `android/.../ambient/*.kt` (first session) /
  `ios/Donna/AmbientAudioModule.swift` (first session): the real native
  capture + route-reporting halves. See their own doc comments — each is
  extensively self-documented, especially around what's real vs.
  honestly-limited (particularly the iOS file).
- **`src/hooks/useAmbientMode.ts`** (second session): the orchestration
  hook. On `enable()`: checks the native module is linked, a Gemini API
  key is saved, and microphone permission is granted (requesting it if
  needed) — any failure tears down and reports an error rather than
  claiming success. On success: starts native capture, opens a
  `GeminiLiveSession` with the ambient setup builder, forwards native mic
  chunks into it, and buffers each turn's output transcript + audio
  chunks as they stream in. Only at `turnComplete` does it call
  `shouldPlayAmbientTurn` against the *live* tracked route (never a
  stale snapshot) to decide whether to enqueue the buffered audio for
  playback at all — a turn that fails either gate is discarded silently,
  nothing partial is ever played. Subscribes to the native
  "force-stopped" event (the OS reclaiming the foreground service, an
  iOS interruption) and treats it exactly like the user tapping the kill
  switch. Persists on/off intent and the one-time-confirmation flag via
  `preferences.ts` (Phase 2), and attempts a best-effort resume on mount
  only if both are true — any resume failure flips the persisted intent
  back off rather than leaving a broken "on" state.
  - Not unit-tested directly, matching this project's existing
    convention for side-effecting session/native wiring (`GeminiLiveSession`
    and `ConversationScreen` are the same) — the logic worth testing in
    isolation is the pure gate it calls (`shouldPlayAmbientTurn`), which
    *is* tested, and the native-bridge fallback path it depends on
    (`__tests__/ambientAudio.test.ts`, from the first session).
- **`src/context/AmbientModeContext.tsx`** (second session): hosts
  exactly one `useAmbientMode()` instance for the whole signed-in app.
  This matters: the hook starts a real background native capture and a
  real websocket session, so it must not be re-instantiated every time a
  screen mounts/unmounts, or navigating to and from the Ambient Mode
  screen would restart (or worse, duplicate) the whole feature.
- **`src/components/AmbientListeningBanner.tsx`** /
  **`src/screens/AmbientModeScreen.tsx`** (second session): the UI. The
  banner is mounted once, above the screen stack in `RootNavigator.tsx`
  (not inside any individual screen), specifically so the "persistent"
  part of "persistent visual + haptic listening indicator" is actually
  true — it stays visible, with its Stop button reachable, no matter
  which screen is on top. The screen itself hosts the toggle, the
  one-time confirmation `Alert`, and a plain-English explanation.
- **Haptics**: `useAmbientMode.ts` calls React Native's built-in
  `Vibration` API (core, not a new native dependency) on the same
  listening/speaking transitions the banner animates — a deliberate
  choice over adding a dedicated haptics library, since that would mean
  another unverified native dependency in a phase that already has two
  new ones (the Android service, the iOS module). Needs
  `android.permission.VIBRATE` in the manifest (added); no iOS
  entitlement needed.

### Design choices worth flagging explicitly

- **Buffer-then-decide, not stream-then-gate.** Ambient mode could have
  started playing each audio chunk as it arrived and aborted mid-reply if
  the gate later failed. Instead it buffers the whole turn (transcript +
  audio) and only decides once `turnComplete` fires. This trades a small
  amount of latency for correctness: neither gate (content, Bluetooth)
  can be evaluated with full confidence until the turn is actually
  finished, and "briefly played a word through the wrong output before
  cutting it off" is a strictly worse failure mode than "a beat of extra
  delay" for a feature whose entire safety story is about *not*
  leaking audio through the wrong route.
- **The Bluetooth route is re-read at decision time, never cached
  across turns.** `routeRef` is updated by the native route-change
  event, but the actual gate check at `turnComplete` reads whatever
  `routeRef` holds *right then* — consistent with `audioRoute.ts`'s own
  doc comment that this check "should never be cached or assumed to
  still hold true from an earlier check."
- **Every failure path flips the persisted "on" toggle back off.**
  Considered leaving the persisted flag as-is on a transient error (so a
  flaky failure wouldn't lose the user's intent), but chose the stricter
  behavior: for a feature whose whole point is an always-listening
  background microphone, a toggle that visibly reads "on" while nothing
  is actually happening is a worse failure mode than making the user
  flip it back on to retry.
- **No dedicated haptics library.** See "Haptics" above — `Vibration` is
  a strictly weaker approximation of real haptic feedback (no
  distinct "tap" vs. "impact" feel, Android-only really respects
  patterns), called out here so a future phase doesn't assume real
  haptic-engine feedback was implemented.

### What a human must verify on real hardware (Phase 3 specifically)

This sandbox has no Android/iOS device or emulator, no microphone, and
no Bluetooth hardware — everything below is implemented to match each
platform's/API's documented behavior but **none of it has been run**:

- Does the app build at all with the new Android foreground service and
  iOS Swift module linked, under RN 0.87's architecture? (This is the
  single biggest unknown in the repo — see README "What a human needs to
  do next".)
- Does the Android foreground service actually survive backgrounding and
  screen lock, and does its persistent notification (with Stop action)
  render correctly across Android versions (the manifest targets both
  pre- and post-API-34 foreground-service permission requirements)?
- Does `AudioRouteInspector.kt` report a real connected Bluetooth
  device's type as one of the strings `BLUETOOTH_OUTPUT_TYPES` in
  `audioRoute.ts` expects? This is the single safety-critical mapping in
  the feature and has never seen a real device's actual reported type.
- On iOS: does `AVAudioSession` configured `.playAndRecord` really keep
  delivering mic input while backgrounded/locked as documented, and for
  how long in practice? Does `AVAudioSession.currentRoute` report
  Bluetooth types under the same string mapping in
  `AmbientAudioModule.swift`'s `normalizedType`? Would this feature, as
  built, actually pass App Review's 2.5.4 scrutiny of `UIBackgroundModes:
  audio` — or does it need to be scoped down (e.g. foreground-only on
  iOS) or backed by a PushToTalk entitlement instead?
- Does the ambient persona reliably emit exactly `AMBIENT_SILENCE_TOKEN`
  when it has nothing to say, against a real Gemini Live session, without
  ever leaking the token into a genuine reply or vice versa?
- Does the haptic pulse (`Vibration.vibrate`) actually fire and feel
  right on real Android/iOS hardware?
- End-to-end: with a Bluetooth device connected, does a spoken interjection
  actually come out of it and never the phone speaker, under real
  conditions (music playing, a phone call, the screen locked)?

## Summary: the full three-phase feature set

- **Phase 1**: React Native (bare, TypeScript) app shell; React
  Navigation auth/app stacks; Firebase email/password + Google
  authentication via the Firebase JS SDK, `.env`-driven, no native
  config files required.
- **Phase 2**: user-supplied, on-device-only Gemini API key
  (`react-native-keychain`, REST-validated before saving); hold-to-talk
  live voice conversation via Gemini's Live API (WebSocket, real mic
  capture, real audio playback, live transcript); a save-history privacy
  toggle; mic/Bluetooth/notification permission visibility.
- **Phase 3**: always-on ambient listening using a second Gemini Live
  session with a "stay quiet unless it's worth it" persona; a hard,
  independently-testable rule that Donna may only speak through a
  connected Bluetooth device; real Android foreground-service and iOS
  `AVAudioEngine`-based native capture; a one-time confirmation dialog; a
  persistent visual + haptic listening indicator with a one-tap kill
  switch; fail-closed behavior throughout.

None of the three phases has been run against real backends/hardware in
this sandbox — every "unverified" note across this file and README.md
still applies cumulatively. See README.md "What a human needs to do
next" for the concrete, ordered checklist to pick this up from here.

## Phase 4 — redesign: new visual identity + continuous conversation

Requested after Phases 1–3 shipped: a full re-theme to a light,
lavender/cream visual identity (from user-supplied reference mockups),
bottom-tab navigation (Home/History/Settings), on-device conversation
history, a Settings screen restructured into nav rows with dedicated
sub-screens, and — the substantive behavior change — replacing
hold-to-talk with a continuous, hands-free conversation.

**What changed:**
- **Design system**: `src/theme/colors.ts` is now a light palette
  (cream background, dusty-lavender/blush accents, pill buttons); every
  screen already read its colors from this one file, so re-theming was
  mostly contained there plus new shared components (`ChatBubble`,
  `ChatInputBar`, `ListeningBlob`, `Avatar`, `StatusPill`, `NavRow`,
  `WelcomeBackdrop`, `BackButton`).
- **Navigation**: flat stack → bottom tabs (`@react-navigation/
  bottom-tabs`), each tab its own nested native-stack; tab bar hides on
  pushed detail screens and on the Home tab entirely (the immersive
  Conversation screen). New `WelcomeScreen` as the unauthenticated
  stack's first screen.
- **Continuous conversation**: `ConversationScreen` no longer has a
  hold-to-talk button. The mic starts streaming once the Live session's
  `setupComplete` fires and keeps streaming continuously — the setup
  message never disables the Live API's automatic (server-side) voice
  activity detection, so the server finds each turn boundary from
  silence in the stream on its own; the client never signals "that's
  one turn." The mic is paused only while Donna's response audio is
  actually playing (no hardware echo cancellation to rely on, so this
  avoids the phone hearing itself), and resumes the instant playback
  finishes. Typed text is a second path into the same session
  (`GeminiLiveSession.sendText`, a `clientContent` turn) — the input bar
  accepts either.
- **History**: `historyStore.ts` (AsyncStorage) actually implements what
  the "save conversation history" toggle has referenced since Phase 2;
  a History tab lists/searches saved sessions and can view one read-only
  or clear everything.
- **Settings**: split from one long form into a nav-row list with
  dedicated `APIKeyScreen`, `VoicePersonaScreen`, `PrivacyScreen`,
  `AboutScreen`.

**What's unverified about this phase specifically** (beyond the
cumulative Phase 1–3 caveats above): the continuous-mode rewrite has
not been exercised against a real Gemini Live session on real
microphone hardware — the *previous* hold-to-talk version was
device-verified (and its one real bug, a WebSocket binary-framing
issue, was found and fixed that way — see the `Fix:` commit before
Phase 4). Specifically worth checking on a real device:
- Does the mic-pause-during-playback actually prevent Donna hearing
  herself, or does some echo still leak through and get treated as the
  next user turn?
- Does automatic server-side VAD feel natural in practice, or does it
  cut in too early/late compared to how hold-to-talk felt?
- The full-screen "focus" listening view (tap the header) — is
  `ListeningBlob`'s animation smooth on real hardware, not just
  logically correct?
- This phase's screens were built and typechecked/linted/unit-tested,
  and a release APK was built successfully for a real device, but could
  not be visually verified against the reference mockups from within
  this environment — the Android emulator is disabled at the sandbox
  level here (not a project limitation). A human should compare the
  running app to the reference designs directly.

## Phase 5 — central memory + onboarding interview

Requested after Phase 4: Donna should ask questions up front to get to
know the user, and keep a "central memory" that grows from ongoing
conversations, visible and editable by the user.

**What's new:**
- **`memoryStore.ts`**: a flat, on-device list of short facts (not a
  structured profile) — the storage shape a Live session's system
  prompt can use directly, with no translation step.
- **`extractMemoryFacts`** (`geminiRest.ts`): a best-effort REST call
  (not Live) that reads one conversation's transcript and proposes new
  facts worth keeping, run after both regular conversations and the
  onboarding interview. Never throws — always resolves to `[]` on any
  failure, since a failed memory update must never interrupt the
  conversation it runs after.
- **Memory-aware prompts**: `buildSetupMessage`/`buildAmbientSetupMessage`
  both accept an optional memory-context block, so both the foreground
  Conversation screen and ambient mode open sessions that already know
  what's been learned so far.
- **`OnboardingScreen`**: a new third top-level branch in
  `RootNavigator` (alongside the auth stack and the main tabs) — a
  freshly signed-in user is walked through API key setup, then a
  guided interview (a distinct persona, `ONBOARDING_SYSTEM_PROMPT`,
  reusing the same `useLiveSession` mechanics as real conversation
  mode) before ever reaching the main app. Skippable, and redoable
  later from Settings ("Redo Getting-to-Know-You Interview").
- **`MemoryScreen`**: every stored fact, tagged by source, editable and
  deletable, plus manual add and clear-all — memory is visible and
  correctable, not a black box.
- **`useLiveSession`**: the continuous-session mechanics (previously
  living only in `ConversationScreen`) extracted into a shared hook so
  onboarding reuses tested logic instead of a second hand-written copy.

**What's unverified about this phase specifically**, beyond the
cumulative caveats above:
- The onboarding interview itself has not been run against a real
  Gemini Live session — same category of gap as Phase 4's continuous-
  mode rewrite, for the same reason (no microphone/emulator in this
  sandbox).
- `extractMemoryFacts`'s prompt has never seen a real transcript or a
  real model response — whether the facts it proposes are actually
  good (specific and useful, not vague or repetitive) can only be
  judged by using the app and checking the Memory screen after a few
  real conversations.
- The `gemini-flash-latest` alias is deliberately un-pinned (see the
  commit for why) — if extraction quality changes noticeably, that's
  the first thing to check.
