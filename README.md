# Donna

Donna is an AI personal assistant for mobile, built with React Native
(bare workflow, TypeScript). This repo is being built in phases — see
[NOTES.md](./NOTES.md) for the roadmap.

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

## Project structure

```
App.tsx                   Entry component: providers + navigator
src/
  audio/
    micStreamer.ts          Mic capture -> base64 PCM chunks (react-native-live-audio-stream)
    playbackQueue.ts         Queued playback of Gemini's PCM audio replies (react-native-sound)
    pcmAudio.ts               Pure PCM -> WAV helpers (unit tested)
  components/              Shared UI (buttons, inputs, error banner, screen chrome, setting rows)
  config/
    firebase.ts             Firebase app/auth initialization (.env-driven)
    authService.ts          signIn/signUp/signOut/Google sign-in/password reset
    apiKeyStore.ts          Gemini API key storage (react-native-keychain)
    geminiRest.ts             Validates a Gemini API key with a real REST call
    geminiLive.ts              Gemini Live (WebSocket) client, persona, message (de)serialization
    preferences.ts            AsyncStorage-backed app preferences (save-history toggle)
  context/AuthContext.tsx  React context exposing the current Firebase user
  hooks/usePermissionStatuses.ts  Mic/Bluetooth/notification permission status + open-settings
  navigation/               Route types + the RootNavigator (auth vs app stack)
  screens/                  Login, Signup, ForgotPassword, Home, Settings, Conversation
  theme/colors.ts           Shared color palette / spacing / radii
  utils/validation.ts       Field validation + Firebase error-message mapping
  types/                    Ambient TypeScript declarations (@env, firebase/auth)
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
