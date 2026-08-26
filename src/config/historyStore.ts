import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSaveHistoryEnabled } from './preferences';

export type HistoryMessage = {
  speaker: 'you' | 'donna';
  text: string;
};

export type HistorySession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: HistoryMessage[];
};

const HISTORY_KEY = '@donna/conversation_history_v1';
const MAX_SESSIONS = 200;
const TITLE_MAX_LENGTH = 48;

/**
 * On-device conversation history. This is Phase 4's implementation of
 * the "save conversation history" preference declared back in
 * preferences.ts: pure `AsyncStorage`, one JSON array, no backend —
 * consistent with the rest of the app's "nothing leaves the device
 * except straight to Google" story. `saveSession` is the single gate
 * that respects the user's toggle: everywhere else in the app can call
 * it freely without re-checking the preference itself.
 */

// Monotonically increasing, even if two sessions save within the same
// millisecond (common when saving back-to-back, e.g. in tests) — a tied
// `updatedAt` would otherwise leave `listSessions`' sort order
// dependent on Array.sort's tie-breaking behavior rather than "most
// recently saved first" actually meaning what it says.
let lastTimestamp = 0;
function nextTimestamp(): number {
  lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
  return lastTimestamp;
}

function titleFromMessages(messages: HistoryMessage[]): string {
  const firstUser = messages.find(m => m.speaker === 'you' && m.text.trim());
  const source = firstUser?.text ?? messages[0]?.text ?? 'New conversation';
  const trimmed = source.trim().replace(/\s+/g, ' ');
  return trimmed.length > TITLE_MAX_LENGTH
    ? `${trimmed.slice(0, TITLE_MAX_LENGTH - 1)}…`
    : trimmed;
}

async function readAll(): Promise<HistorySession[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt storage shouldn't crash the History screen — treat it as empty.
    return [];
  }
}

async function writeAll(sessions: HistorySession[]): Promise<void> {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(sessions));
}

/** All saved sessions, most recently updated first. */
export async function listSessions(): Promise<HistorySession[]> {
  const sessions = await readAll();
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Sessions whose title or any message text contains `query` (case-insensitive). */
export async function searchSessions(query: string): Promise<HistorySession[]> {
  const needle = query.trim().toLowerCase();
  const sessions = await listSessions();
  if (!needle) return sessions;
  return sessions.filter(
    session =>
      session.title.toLowerCase().includes(needle) ||
      session.messages.some(m => m.text.toLowerCase().includes(needle)),
  );
}

/**
 * Saves (or overwrites, by id) one conversation. No-ops when the user
 * hasn't opted in to history (FR-2.4) or when there's nothing worth
 * keeping. Oldest sessions are dropped past `MAX_SESSIONS` so this
 * can't grow unbounded on a device that's never cleared its history.
 */
export async function saveSession(
  id: string,
  messages: HistoryMessage[],
): Promise<void> {
  if (messages.length === 0) return;
  if (!(await getSaveHistoryEnabled())) return;

  const sessions = await readAll();
  const existingIndex = sessions.findIndex(s => s.id === id);
  const session: HistorySession = {
    id,
    title: titleFromMessages(messages),
    updatedAt: nextTimestamp(),
    messages,
  };

  if (existingIndex >= 0) {
    sessions[existingIndex] = session;
  } else {
    sessions.push(session);
  }

  const trimmed = sessions
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS);
  await writeAll(trimmed);
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = await readAll();
  await writeAll(sessions.filter(s => s.id !== id));
}

export async function clearAllSessions(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY);
}
