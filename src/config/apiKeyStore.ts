import * as Keychain from 'react-native-keychain';

/**
 * On-device storage for the user's own Gemini API key.
 *
 * The key never leaves the device except in direct calls the device makes
 * to Google's Gemini endpoints (REST validation + the Live API websocket).
 * It is stored via react-native-keychain, which uses the iOS Keychain /
 * Android Keystore — hardware-backed secure storage, not AsyncStorage or
 * any plain-text file, and not synced anywhere by this app.
 *
 * A dedicated `service` name namespaces this credential so it can't
 * collide with anything else that might use the keychain later (e.g. a
 * future feature storing a different secret).
 */
const SERVICE = 'com.donna.gemini_api_key';
const USERNAME = 'gemini';

// A fixed, non-secret "username" paired with the real secret in the
// `password` field — react-native-keychain's generic-password API always
// stores a username/password pair, so USERNAME above is just a slot label.
const SET_OPTIONS: Keychain.SetOptions = {
  service: SERVICE,
  accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const GET_OPTIONS: Keychain.BaseOptions = { service: SERVICE };

/**
 * Saves the Gemini API key to the device keychain, replacing any
 * previously stored key. Callers should validate the key (see
 * `geminiRest.ts`) before saving it.
 */
export async function saveGeminiApiKey(apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error('API key cannot be empty.');
  }

  try {
    await Keychain.setGenericPassword(USERNAME, trimmed, {
      ...SET_OPTIONS,
      securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
    });
  } catch {
    // Not every Android device has a hardware-backed keystore; fall back
    // to the library's default security level rather than failing to
    // save the key at all.
    await Keychain.setGenericPassword(USERNAME, trimmed, SET_OPTIONS);
  }
}

/** Returns the stored Gemini API key, or `null` if none has been saved. */
export async function getGeminiApiKey(): Promise<string | null> {
  const result = await Keychain.getGenericPassword(GET_OPTIONS);
  if (!result) return null;
  return result.password;
}

/** Returns whether a Gemini API key is currently stored on-device. */
export async function hasGeminiApiKey(): Promise<boolean> {
  return Keychain.hasGenericPassword(GET_OPTIONS);
}

/** Removes the stored Gemini API key from the device keychain. */
export async function clearGeminiApiKey(): Promise<void> {
  await Keychain.resetGenericPassword(GET_OPTIONS);
}
