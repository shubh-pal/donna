# Donna

Donna is an AI personal assistant for mobile, built with React Native
(bare workflow, TypeScript). This repo was built in three phases — see
[NOTES.md](./NOTES.md) for the full build log. **Phase 3 (ambient mode)
is the last planned phase**; see "What a human needs to do next" below
before treating any of this as finished.

## Phase 1 — what's built

- **App scaffold**: React Native CLI template (bare workflow, not Expo
  Go), TypeScript, so native modules can be added freely in later phases.
- **Navigation**: React Navigation (`native-stack`) with two stacks —
  an auth stack (Login, Signup, Forgot Password) and an app stack (Home,
  Settings) — switched automatically based on Firebase auth state.
- **Authentication**: Firebase Authentication via the Firebase JS SDK —
  email/password sign-up, sign-in, password reset, and Google Sign-In,
  all wired to real Firebase calls (no mocked auth logic). Config is
  `.env`-driven so no secrets are committed.
- **Form validation**: client-side validation (email format, password
  length, confirm-password match) plus mapped, human-readable error
  messages for Firebase auth error codes.
- **Tooling**: ESLint + Prettier + TypeScript configured, a `.gitignore`
  that keeps secrets/build artifacts/keystores out of the repo, and a
  smoke test.

## Phase 2 — what's built

- **Your own Gemini API key, stored on-device only**: Settings has a
  field to paste a key from [Google AI Studio](https://aistudio.google.com).
  It's validated with a real (lightweight) call to the Gemini API before
  saving, then stored via `react-native-keychain` — the iOS Keychain /
  Android Keystore, not `AsyncStorage` or a plain file — and is never
  sent anywhere except directly from this device to Google's endpoints.
- **Live voice conversation with Donna**: a hold-to-talk Conversation
  screen that opens a session with Google's Gemini **Live API**
  (WebSocket-based, real-time audio in and out), streams microphone
  audio to it, and plays Donna's spoken replies back. Shows a live
  transcript and distinct listening / thinking / speaking states.
  Donna's persona: sharp, witty, dry, unflappable, extremely competent,
  calls things as they are — see `src/config/geminiLive.ts` for the
  system prompt.
- **Privacy controls**: a "save conversation history" toggle (off by
  default) and an in-app note explaining that conversation features
  send audio/text to Google's Gemini API once a key is set up — and
  nowhere else.
- **Permission visibility**: Settings shows current microphone /
  Bluetooth / notification permission status, with a link to the OS
  Settings app when something's denied. (Bluetooth/notifications aren't
  used by anything yet — they're ahead of Phase 3's ambient mode.)

**Important — this phase hasn't been run on a real device or emulator**
in the sandbox this was built in (no microphone, no way to open a real
Gemini Live session). Everything is implemented against Google's
documented API and the relevant libraries' documented behavior, and
covered by unit tests wherever the logic is pure enough to test without
real hardware — but the mic-capture → Gemini Live → speaker-playback
path as a whole needs a real device pass. See NOTES.md for specifics
and how to do that pass yourself.

## Phase 3 — what's built (final phase)

- **Ambient (background) listening mode**: an always-on listening mode,
  separate from the hold-to-talk Conversation screen, that streams
  microphone audio to a second Gemini Live session running a distinct
  "stay quiet unless it's genuinely worth saying" persona. Turned on/off
  from **Settings → Ambient mode** or the button on Home.
- **The one hard safety rule, enforced in one place**: Donna may only
  ever speak an ambient reply out loud through a **connected Bluetooth
  device** — never the phone's own speaker or earpiece. This is checked
  fresh, immediately before every single utterance, by
  `shouldPlayAmbientTurn()` in `src/config/ambientLive.ts` (combining the
  content gate in the same file with `canDonnaSpeakThroughThisRoute()` in
  `src/audio/audioRoute.ts`) — both are pure, dependency-free, and unit
  tested. If no Bluetooth output is connected, Donna keeps listening and
  simply never speaks; nothing is queued for playback, let alone played.
- **A real one-time confirmation dialog**: the first time a user turns
  ambient mode on, they see a plain-English explanation of what it does
  (continuous background listening, audio sent to Google, Bluetooth-only
  speech) before anything starts. Tracked via a versioned preference
  (`src/config/preferences.ts`) so it doesn't reappear every time.
- **Real native background capture, not a simulation**:
  - **Android**: a genuine foreground `Service`
    (`android/app/src/main/java/com/donna/ambient/AmbientForegroundService.kt`)
    doing `AudioRecord` mic capture, with the OS-required persistent
    "Donna is listening" notification (which doubles as an OS-level,
    can't-be-hidden listening indicator and carries a one-tap Stop
    action baked into the notification itself), declared with
    `foregroundServiceType="microphone"` so capture survives the app
    being backgrounded or the screen locked.
  - **iOS**: a native module
    (`ios/Donna/AmbientAudioModule.swift`) built on `AVAudioEngine` +
    `AVAudioSession` (`.playAndRecord` category, `UIBackgroundModes:
    audio`) — the same real mechanism VoIP/podcast/dictation apps use
    for background audio. Honestly **not** the same guarantee as
    Android's foreground service — see "Known limitations" below and
    NOTES.md "Phase 3 — iOS" before assuming otherwise.
  - Both sides report the live system audio output route back to JS,
    normalized to one shared vocabulary (`AudioOutputDeviceType` in
    `src/audio/audioRoute.ts`), which is what the Bluetooth gate above
    actually reads.
- **Persistent visual + haptic listening indicator, plus a one-tap kill
  switch**: `AmbientListeningBanner` is mounted once above the whole app
  (not per-screen), so it — and its "Stop" button — stay visible and
  reachable from every screen while ambient mode is active, with a
  pulsing dot showing listening/speaking state. `useAmbientMode.ts` pairs
  this with short haptic pulses (`Vibration` from React Native core — no
  extra native dependency) on the same transitions. The kill switch
  (banner's Stop button, or the Settings toggle) always works
  immediately, from any phase, from anywhere in the app.
- **Fails closed everywhere**: no native module linked, no Gemini API
  key saved, microphone permission denied, the Live session drops — every
  one of these tears the feature down and flips the "on" toggle back off
  rather than leaving the UI claiming ambient mode is running when it
  isn't. Ambient mode also never auto-starts on a fresh app launch
  without having been confirmed at least once.

### Known limitations (Phase 3) — read before relying on this

- **Not run on any real device or emulator.** Exactly like Phase 2, this
  sandbox has no Android/iOS device, no emulator, no microphone, and no
  way to open a real Gemini Live session or pair a real Bluetooth
  device. Every native file here is written directly against Android's/
  Apple's/Google's documented APIs and reviewed carefully, but **none of
  it has actually been built, launched, or exercised on hardware.**
- **iOS background listening is fundamentally weaker than Android's.**
  Apple gives no equivalent of Android's foreground-service guarantee —
  `UIBackgroundModes: audio` is real and documented, but iOS can still
  suspend the app if it decides the audio session isn't "genuinely"
  active, and Apple's App Review guidelines (2.5.4) specifically
  scrutinize this background mode when used for something other than
  continuous, user-evident audio playback/recording. An always-on
  passive-listening assistant is a plausible App Review rejection risk
  on iOS *independent of whether the code works* — see
  `ios/Donna/AmbientAudioModule.swift`'s doc comment and NOTES.md for the
  full writeup, including why a PushToTalk entitlement (not implemented
  here) would be the real next step if this needs to be App-Review-safe.
- **The Live API has no server-side "stay silent" signal.** Every turn
  produces *some* model output; the silence convention
  (`AMBIENT_SILENCE_TOKEN`) is enforced client-side by prompting and by
  `shouldSuppressAmbientReply()`. That means every turn where Donna
  chooses not to interject still costs a small amount of the user's
  Gemini API quota/latency, even though nothing is ever heard.
- **Ambient mode does not auto-resume after the app is fully closed and
  relaunched**, even if it was on when the app last closed — a
  deliberate choice (never silently start the microphone without a
  fresh, explicit action in the current app session), not an oversight.
  Merely backgrounding the app (without the process being killed) is
  unaffected either way, since nothing tears the session down on
  backgrounding — that's the whole point of ambient mode.
- **Playback is buffered per-turn, not streamed.** Ambient mode buffers
  a whole turn's audio + transcript and only decides whether to play it
  (Bluetooth connected? not the silence token?) once the turn completes
  — the safest option given the two gates above have to be checked
  before anything is queued, but it means a slightly longer delay before
  a permitted reply starts playing, on top of Phase 2's existing
  file-per-chunk playback gap (see `playbackQueue.ts`).
- **Multi-user devices aren't specifically handled.** If a second person
  signs into the app on the same physical device, a previously-confirmed
  "ambient mode on" intent can resume for them without a fresh
  confirmation dialog, since the confirmation flag isn't scoped per
  Firebase user. Not a concern for the single-user use case this was
  built for, but worth fixing before treating this as multi-tenant-safe.

## Project structure

```
App.tsx                   Entry component: providers + navigator
src/
  audio/
    micStreamer.ts          Mic capture -> base64 PCM chunks (react-native-live-audio-stream)
    playbackQueue.ts         Queued playback of Gemini's PCM audio replies (react-native-sound)
    pcmAudio.ts               Pure PCM -> WAV helpers (unit tested)
    audioRoute.ts             The Bluetooth speak-gate: AudioOutputDeviceType vocabulary + isBluetoothOutputActive (unit tested)
  components/              Shared UI (buttons, inputs, error banner, screen chrome, setting rows)
    AmbientListeningBanner.tsx  Global "Donna is listening" indicator + one-tap kill switch
  config/
    firebase.ts             Firebase app/auth initialization (.env-driven)
    authService.ts          signIn/signUp/signOut/Google sign-in/password reset
    apiKeyStore.ts          Gemini API key storage (react-native-keychain)
    geminiRest.ts             Validates a Gemini API key with a real REST call
    geminiLive.ts              Gemini Live (WebSocket) client, persona, message (de)serialization
    ambientLive.ts             Ambient persona + silence-token convention + the combined speak gate (unit tested)
    preferences.ts            AsyncStorage-backed app preferences (history/ambient-mode toggles)
  context/
    AuthContext.tsx          React context exposing the current Firebase user
    AmbientModeContext.tsx    Hosts the single app-wide useAmbientMode() instance
  hooks/
    usePermissionStatuses.ts  Mic/Bluetooth/notification permission status + open-settings
    useAmbientMode.ts          Ambient mode orchestration: native bridge + Gemini Live + the speak gate
  native/ambientAudio.ts    JS bridge to the native ambient-listening modules (fails closed if unlinked)
  navigation/               Route types + the RootNavigator (auth vs app stack)
  screens/                  Login, Signup, ForgotPassword, Home, Settings, Conversation, AmbientMode
  theme/colors.ts           Shared color palette / spacing / radii
  utils/validation.ts       Field validation + Firebase error-message mapping
  types/                    Ambient TypeScript declarations (@env, firebase/auth)
android/app/src/main/java/com/donna/ambient/   Foreground service, native module, audio-route inspector (Kotlin)
ios/Donna/AmbientAudioModule.swift              AVAudioEngine/AVAudioSession-based ambient capture (Swift)
```

## Setup

### 1. Install dependencies

```bash
npm install
```

iOS also needs CocoaPods installed once native code is added to the
build (not required to run the JS bundle in Phase 1, but needed before
`npm run ios`):

```bash
bundle install
cd ios && bundle exec pod install && cd ..
```

### 2. Create a Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com/)
   and create a project (or use an existing one).
2. Add a **Web app** to the project (Project settings → General → Your
   apps → Add app → Web). You don't need Firebase Hosting — this just
   gives you the SDK config object the JS SDK uses on every platform.
3. Enable **Authentication** providers: Build → Authentication → Sign-in
   method → enable **Email/Password** and **Google**.
4. For Google Sign-In, open the Google provider's settings and copy the
   **Web client ID** (Firebase creates this automatically) — you'll need
   it below. This is the "Web SDK configuration" client ID, distinct
   from any Android/iOS OAuth client.

### 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in `.env` with the values from Project settings → General → Your
apps → SDK setup and configuration, plus the Google web client ID from
step 2.4 above. **Never commit `.env`** — it's already git-ignored.

Restart Metro after editing `.env` (`react-native-dotenv` inlines the
values at build time, so a running bundler won't pick up changes).

### 4. Run the app

```bash
npm start
# in another terminal
npm run android   # or: npm run ios
```

### Notes on native setup (later phases)

- Android Google Sign-In will additionally need your debug/release SHA-1
  fingerprint registered in the Firebase console, and (if you switch to
  `@react-native-firebase` for native modules) `android/app/google-services.json`
  / `ios/GoogleService-Info.plist` downloaded from the console. Both
  filenames are already git-ignored — see `.gitignore`.
- The JS SDK approach used here needs no native config files to work;
  those become relevant if a later phase adds native Firebase modules.

### 5. Set up conversation mode (Phase 2)

Conversation mode needs a **real device or emulator with a working
microphone** — it can't be exercised in a headless/CI environment.

1. Get a free Gemini API key from
   [Google AI Studio](https://aistudio.google.com).
2. Run the app on a device/emulator (`npm run android` or `npm run ios`),
   sign in, go to **Settings**, paste the key into the Gemini API key
   field, and tap **Validate & save**. This makes one real, lightweight
   call to Google to confirm the key works before storing it.
3. Go to the **Home** screen and tap **Talk to Donna**, or open the
   **Conversation** screen directly. Grant the microphone permission
   when prompted, then hold the mic button and talk; release to hear
   Donna's reply.

If a real device isn't available, everything up to step 2's key
validation (a plain HTTPS call) still works in an emulator with network
access; step 3 needs real mic hardware.

Because this project was built without device access, the mic-capture →
Gemini Live → speaker-playback path has not been exercised end-to-end —
see NOTES.md for what to check first if something doesn't work as
expected.

### 6. Set up ambient mode (Phase 3)

Ambient mode needs everything Conversation mode needs (steps 1–5 above)
**plus** a real Bluetooth audio device (headphones, earbuds, a car kit —
anything the OS reports as a Bluetooth audio output) to ever hear a
reply out loud, and it needs to actually be built as a native app — it
cannot run inside Metro/JS-only tooling the way validating a key can.

1. Build and install the app on a real device (`npm run android` /
   `npm run ios` — see "What a human needs to do next" below for the
   native build steps this sandbox couldn't run).
2. Sign in, go to **Settings → Ambient mode** (or tap **Set up ambient
   mode** on Home), and turn the switch on. Read and accept the
   confirmation dialog — it only appears once.
3. Grant the microphone permission when prompted. On Android, watch for
   the persistent "Donna is listening" notification — that's the
   OS-required indicator that background capture is active, and it has
   its own Stop action. In-app, the banner at the top of every screen is
   the same indicator, with its own Stop button.
4. Connect a Bluetooth audio device. The Settings/Ambient Mode screen
   and the top banner both show whether one is connected right now —
   until one is, Donna listens but never speaks, by design.
5. Talk normally near the device. If something Donna's persona judges
   worth saying comes up, you should hear it through the Bluetooth
   device only — never the phone's speaker. If nothing happens, that's
   the expected common case (see NOTES.md on the silence-token
   convention), not necessarily a bug.

**None of this has been exercised in the sandbox this was built in** —
no device, no emulator, no Bluetooth hardware, no way to launch a native
build at all. See "What a human needs to do next" below.

## What a human needs to do next

This entire project — all three phases — was built in a cloud sandbox
with **no Android/iOS device or emulator, no microphone, no Bluetooth
hardware, no macOS/Xcode, and no network path to Google's Live API or
Firebase**. Everything is implemented directly against each platform's/
library's/API's documented behavior and is covered by unit tests
wherever the logic is pure enough to test without hardware, but none of
the following has been verified by actually running the app. In rough
order of what to check first:

1. **Create a real Firebase project and add real config.** Follow
   "Create a Firebase project" and "Configure environment variables"
   above — this repo has never talked to a real Firebase project.
2. **Get a real Gemini API key** from
   [Google AI Studio](https://aistudio.google.com) and confirm Settings'
   "Validate & save" actually accepts it (a real network call this
   sandbox couldn't make).
3. **Do a full native build on both platforms** — `npm install`, then
   `bundle install && cd ios && bundle exec pod install && cd ..` for
   iOS, then `npm run android` and `npm run ios`. This is the single
   biggest unknown in the whole repo: three phases of native code
   (Google Sign-In, keychain, audio capture/playback, permissions, and
   now a full Android foreground service + an iOS Swift module) have
   never been compiled together. Expect to fix native build errors —
   version mismatches, missing linking steps, Gradle/CocoaPods
   resolution issues — before anything else on this list matters.
4. **Verify Conversation mode (Phase 2) end-to-end on a real device**:
   does a Gemini Live session actually connect with the model ID in
   `geminiLive.ts`, does the message schema match what the API sends
   back, does mic capture → playback sound right. See NOTES.md "What
   hasn't been verified" under Phase 2 for the specific open questions.
5. **Verify ambient mode (Phase 3) on real Android hardware**: does the
   foreground service survive backgrounding and screen lock, does the
   persistent notification and its Stop action work, does
   `AudioRouteInspector.kt` correctly report a connected Bluetooth
   device, does the app actually stay silent with no Bluetooth
   connected and actually speak once one connects.
6. **Verify ambient mode (Phase 3) on real iOS hardware**, and read
   `ios/Donna/AmbientAudioModule.swift`'s doc comment and NOTES.md
   "Phase 3 — iOS" first — iOS's background-audio allowance is real but
   materially weaker than Android's foreground service, and is also an
   App Review risk for a passive-listening use case. Decide whether
   that tradeoff is acceptable before shipping, or scope down what
   "ambient mode" means on iOS specifically (e.g. foreground-only).
7. **Pair a real Bluetooth device** and confirm the specific type
   strings `AudioRouteInspector.kt` (Android) and the `normalizedType`
   switch in `AmbientAudioModule.swift` (iOS) map it to actually land in
   `BLUETOOTH_OUTPUT_TYPES` in `src/audio/audioRoute.ts` — this is the
   single safety-critical mapping in the whole feature, and it has never
   seen a real device's reported type string.
8. **Load-test the "silence token" convention** — with a real model,
   confirm it reliably outputs exactly `<NO_REPLY>` when it has nothing
   to say, and doesn't leak the token into genuine replies or vice versa.
   Tune `AMBIENT_SYSTEM_PROMPT` in `src/config/ambientLive.ts` if not.
9. **Decide on `GEMINI_LIVE_MODEL`'s long-term stability.** It's a
   preview model name (`models/gemini-3.1-flash-live-preview`) that
   Google can and has sunset before; check
   [ai.google.dev/gemini-api/docs/live-api](https://ai.google.dev/gemini-api/docs/live-api)
   for the current recommendation before shipping and periodically after.
10. **Address the known limitations list above** as needed for your use
    case — most notably the per-user confirmation scoping and iOS's
    weaker background guarantee.

## Scripts

| Command                | What it does                          |
| ----------------------- | -------------------------------------- |
| `npm start`             | Start the Metro bundler                |
| `npm run android`       | Build & run on Android                 |
| `npm run ios`           | Build & run on iOS                     |
| `npm test`              | Run the Jest test suite                |
| `npm run lint`          | Lint with ESLint                       |
| `npm run format`        | Format with Prettier                   |
| `npm run format:check`  | Check formatting without writing       |
| `npm run typecheck`     | Type-check with `tsc --noEmit`         |

## Troubleshooting

- **"Firebase config is missing" warning on start**: you haven't created
  `.env` yet, or it's still using empty placeholder values. Follow
  Setup steps 2–3 above.
- **Google Sign-In fails immediately**: double check `GOOGLE_WEB_CLIENT_ID`
  in `.env` is the *Web* client ID from the Firebase console's Google
  provider settings, not an Android/iOS client ID.
- **"That key was rejected by Google"** in Settings: the Gemini API key
  is wrong, disabled, or the Generative Language API isn't enabled for
  the Google Cloud project it belongs to. Re-check it in
  [Google AI Studio](https://aistudio.google.com).
- **Conversation screen sends you back to Settings**: no Gemini API key
  is saved yet on this device — keys are per-device (keychain-backed),
  so a fresh install or a different device needs the key entered again.
- **No sound / mic doesn't seem to work in Conversation mode**: this
  needs a real device or emulator with mic support and the microphone
  permission granted (check Settings → Permissions); it can't be
  exercised in this sandbox — see NOTES.md.
- **Ambient mode's switch immediately flips back off with an error**:
  read the error text shown in Settings → Ambient mode — it's one of "no
  native module linked" (this build's native code needs the Phase 3
  Android/iOS files actually compiled in), "no API key" (add one in
  Settings first), or "microphone permission" (allow it, then retry).
  This is deliberate fail-closed behavior, not a crash.
- **Ambient mode is on but never speaks**: expected if no Bluetooth
  audio device is connected — Donna listens silently by design and only
  speaks through Bluetooth. Also expected, separately, on most turns
  even *with* Bluetooth connected — see NOTES.md on the silence-token
  convention; staying quiet is the overwhelmingly common case.
