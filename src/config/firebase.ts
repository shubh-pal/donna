import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import {
  FIREBASE_API_KEY,
  FIREBASE_APP_ID,
  FIREBASE_AUTH_DOMAIN,
  FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
} from '@env';

const firebaseConfig = {
  apiKey: FIREBASE_API_KEY,
  authDomain: FIREBASE_AUTH_DOMAIN,
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: FIREBASE_STORAGE_BUCKET,
  messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
  appId: FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey) {
  console.warn(
    '[donna] Firebase config is missing. Copy .env.example to .env and fill ' +
      'in your Firebase project values, then rebuild. See README.md.',
  );
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
/**
 * Set if Firebase failed to initialize (missing/invalid config, or any
 * other startup error) — checked by `authService.ts` so every function
 * there fails gracefully with a message the existing sign-in-error UI
 * already knows how to show, instead of every one of them throwing a
 * raw, uncaught exception the moment the app opens.
 *
 * This used to be a hard crash on launch (an invalid API key threw
 * inside a `useEffect` with no error boundary around it, which crashed
 * the entire native app before the user ever saw a screen) — found via
 * a real device's logcat during testing. However this config ends up
 * wrong in the future (missing .env, an expired/revoked key, Firebase
 * itself being unreachable), the app should degrade to "sign-in isn't
 * working right now," never to "the app won't open."
 */
export let firebaseInitError: Error | null = null;

try {
  // Guard against re-initializing on Fast Refresh.
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
  } catch {
    // initializeAuth throws if it was already called for this app (e.g.
    // Fast Refresh) — fall back to the existing instance. This fallback
    // can *also* throw (e.g. a genuinely invalid API key) — that's
    // caught by the outer try below, not swallowed here.
    auth = getAuth(app);
  }
} catch (error) {
  firebaseInitError =
    error instanceof Error ? error : new Error(String(error));
  console.warn('[donna] Firebase failed to initialize:', firebaseInitError);
}

export { app, auth };
