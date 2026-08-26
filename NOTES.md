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

## What's coming next

- **Phase 2 (planned): Gemini Live conversation mode** — real-time
  voice/text conversation with Donna using the Gemini Live API.
- **Phase 3 (planned): Ambient background listening mode** — always-on
  or wake-word-triggered listening so Donna can respond without an
  explicit "start conversation" action, including the native
  audio-capture and background-task work that the bare-workflow choice
  in Phase 1 was made to support.

Scope for those phases is intentionally not started here — this phase
is app shell + auth only.
