import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { GOOGLE_WEB_CLIENT_ID } from '@env';
import { auth, firebaseInitError } from './firebase';

let googleConfigured = false;

/** Thrown by every function below when Firebase failed to initialize — see firebase.ts's `firebaseInitError` doc comment for why this exists. */
function requireAuth() {
  if (!auth) {
    throw new Error(
      firebaseInitError
        ? `Sign-in isn't set up correctly on this device (${firebaseInitError.message}). Please check the app's Firebase configuration.`
        : "Sign-in isn't available right now. Please try again in a moment.",
    );
  }
  return auth;
}

/**
 * Configures the native Google Sign-In module. Safe to call multiple
 * times; only runs once. Must happen before `signInWithGoogle`.
 */
export function configureGoogleSignIn(): void {
  if (googleConfigured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
  googleConfigured = true;
}

/**
 * Never throws even if Firebase failed to initialize — reports "signed
 * out" once and returns a no-op unsubscribe, so the app still opens
 * normally (to the sign-in screens) instead of crashing. An actual
 * sign-in *attempt* in that state fails through the normal, already-
 * handled error path (see `requireAuth` above), not a crash.
 */
export function subscribeToAuthChanges(
  callback: (user: User | null) => void,
): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(
    requireAuth(),
    email,
    password,
  );
  if (name) {
    await updateProfile(credential.user, { displayName: name });
  }
  return credential.user;
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<User> {
  const credential = await signInWithEmailAndPassword(
    requireAuth(),
    email,
    password,
  );
  return credential.user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(requireAuth(), email);
}

export async function signInWithGoogle(): Promise<User> {
  const activeAuth = requireAuth();
  configureGoogleSignIn();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const { data } = await GoogleSignin.signIn();
  const idToken = data?.idToken;
  if (!idToken) {
    throw new Error('Google sign-in did not return an ID token.');
  }
  const googleCredential = GoogleAuthProvider.credential(idToken);
  const credential = await signInWithCredential(activeAuth, googleCredential);
  return credential.user;
}

export async function signOutUser(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // User may not have signed in with Google — ignore.
  }
  if (auth) await signOut(auth);
}
