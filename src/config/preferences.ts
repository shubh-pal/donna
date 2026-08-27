import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Small AsyncStorage-backed preferences. Nothing here is sensitive (the
 * Gemini API key lives in the keychain instead — see apiKeyStore.ts), so
 * plain AsyncStorage is fine.
 */
const SAVE_HISTORY_KEY = '@donna/save_conversation_history';
const AMBIENT_MODE_ENABLED_KEY = '@donna/ambient_mode_enabled';
const AMBIENT_MODE_CONFIRMED_KEY = '@donna/ambient_mode_confirmed_v1';
const ONBOARDING_COMPLETE_KEY = '@donna/onboarding_complete_v1';

/**
 * Whether Donna should keep a local record of past conversations. On
 * by default (Phase 5) — history and memory extraction both read this,
 * and a user who wants neither can turn it off from the Privacy screen,
 * which also clears whatever's already stored the moment it's flipped
 * off. `null` (never explicitly set) is treated as "on"; only an
 * explicit `'false'` write turns it off.
 */
export async function getSaveHistoryEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(SAVE_HISTORY_KEY);
  return value !== 'false';
}

export async function setSaveHistoryEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(SAVE_HISTORY_KEY, enabled ? 'true' : 'false');
}

/**
 * Whether ambient (background/lock-screen) listening mode is turned on.
 * Off by default. This flag is the user's *intent* — the app also needs
 * mic/notification permissions and (on Android) the foreground service
 * to actually be running for ambient mode to be functionally active;
 * see `useAmbientMode.ts`, which treats this as one input among several.
 */
export async function getAmbientModeEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(AMBIENT_MODE_ENABLED_KEY);
  return value === 'true';
}

export async function setAmbientModeEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(
    AMBIENT_MODE_ENABLED_KEY,
    enabled ? 'true' : 'false',
  );
}

/**
 * Whether the user has already seen and accepted the "this continuously
 * processes audio via Google's Gemini API" confirmation dialog. Tracked
 * so that dialog only interrupts the very first time ambient mode is
 * enabled, per the brief — not every time. Versioned in the storage key
 * (`_v1`) so a future phase can force the dialog to reappear (e.g. after
 * a material change to what ambient mode does) just by bumping it.
 */
export async function getAmbientModeConfirmed(): Promise<boolean> {
  const value = await AsyncStorage.getItem(AMBIENT_MODE_CONFIRMED_KEY);
  return value === 'true';
}

export async function setAmbientModeConfirmed(
  confirmed: boolean,
): Promise<void> {
  await AsyncStorage.setItem(
    AMBIENT_MODE_CONFIRMED_KEY,
    confirmed ? 'true' : 'false',
  );
}

/**
 * Whether the user has been through (or explicitly skipped) the
 * "getting to know you" onboarding interview at least once. Gates
 * whether `RootNavigator` routes a freshly-signed-in user into
 * `OnboardingScreen` before the main app — see `AuthContext.tsx`,
 * which reads this once per sign-in and exposes it as
 * `onboardingComplete`.
 */
export async function getOnboardingComplete(): Promise<boolean> {
  const value = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
  return value === 'true';
}

export async function setOnboardingComplete(
  complete: boolean,
): Promise<void> {
  await AsyncStorage.setItem(
    ONBOARDING_COMPLETE_KEY,
    complete ? 'true' : 'false',
  );
}
