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

Not in this phase: the actual AI conversation features (Gemini Live,
ambient listening) — see NOTES.md.

## Project structure

```
App.tsx                   Entry component: providers + navigator
src/
  components/              Shared UI (buttons, inputs, error banner, screen chrome)
  config/
    firebase.ts            Firebase app/auth initialization (.env-driven)
    authService.ts         signIn/signUp/signOut/Google sign-in/password reset
  context/AuthContext.tsx  React context exposing the current Firebase user
  navigation/               Route types + the RootNavigator (auth vs app stack)
  screens/                  Login, Signup, ForgotPassword, Home, Settings
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
