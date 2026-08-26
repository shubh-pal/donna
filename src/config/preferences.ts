import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Small AsyncStorage-backed preferences. Nothing here is sensitive (the
 * Gemini API key lives in the keychain instead — see apiKeyStore.ts), so
 * plain AsyncStorage is fine.
 */
const SAVE_HISTORY_KEY = '@donna/save_conversation_history';

/**
 * Whether Donna should keep a local record of past conversations.
 * Off by default — Phase 2 doesn't yet persist any transcript when this
 * is off (or on, for that matter; see NOTES.md), but the app-wide
 * setting is wired up now so the Conversation screen and future phases
 * have a single source of truth to check.
 */
export async function getSaveHistoryEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(SAVE_HISTORY_KEY);
  return value === 'true';
}

export async function setSaveHistoryEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(SAVE_HISTORY_KEY, enabled ? 'true' : 'false');
}
