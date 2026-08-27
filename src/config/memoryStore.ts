import AsyncStorage from '@react-native-async-storage/async-storage';

export type MemoryFactSource = 'onboarding' | 'conversation' | 'manual';

export type MemoryFact = {
  id: string;
  text: string;
  source: MemoryFactSource;
  createdAt: number;
  updatedAt: number;
};

const MEMORY_KEY = '@donna/memory_facts_v1';

/**
 * Donna's "central memory" about the user — a flat list of short,
 * plain-English facts (not a structured profile schema), stored
 * on-device via AsyncStorage like everything else in this app. Facts
 * come from three places, tracked in `source` purely so the Memory
 * screen can show provenance, not because the app treats them
 * differently: the onboarding interview, an automatic best-effort
 * extraction pass after regular conversations (see
 * `geminiRest.extractMemoryFacts`), and manual edits in Settings.
 *
 * Deliberately *not* a queryable/structured store — the whole point is
 * that this gets read back as a short block of plain text and dropped
 * into a Gemini Live system prompt (`buildMemoryContextBlock`), so a
 * flat list of sentences is both the simplest storage shape and
 * directly usable without a translation step.
 */

let lastTimestamp = 0;
function nextTimestamp(): number {
  lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
  return lastTimestamp;
}

function makeId(): string {
  return `fact-${nextTimestamp()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readAll(): Promise<MemoryFact[]> {
  const raw = await AsyncStorage.getItem(MEMORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAll(facts: MemoryFact[]): Promise<void> {
  await AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(facts));
}

/** All stored facts, oldest first (roughly the order Donna learned them). */
export async function listFacts(): Promise<MemoryFact[]> {
  const facts = await readAll();
  return [...facts].sort((a, b) => a.createdAt - b.createdAt);
}

/** True if `text` is a near-duplicate of something already stored — a simple case/whitespace-insensitive containment check, not fuzzy matching. */
function isDuplicate(existing: MemoryFact[], text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return true;
  return existing.some(fact => {
    const existingNormalized = fact.text.trim().toLowerCase();
    return (
      existingNormalized === normalized ||
      existingNormalized.includes(normalized) ||
      normalized.includes(existingNormalized)
    );
  });
}

/** Adds one fact, skipping it if it's empty or a near-duplicate of one already stored. Returns the created fact, or null if skipped. */
export async function addFact(
  text: string,
  source: MemoryFactSource,
): Promise<MemoryFact | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const facts = await readAll();
  if (isDuplicate(facts, trimmed)) return null;

  const now = nextTimestamp();
  const fact: MemoryFact = {
    id: makeId(),
    text: trimmed,
    source,
    createdAt: now,
    updatedAt: now,
  };
  facts.push(fact);
  await writeAll(facts);
  return fact;
}

/** Adds several facts in one write, deduplicating against existing facts and against each other. Returns only the ones actually added. */
export async function addFacts(
  texts: string[],
  source: MemoryFactSource,
): Promise<MemoryFact[]> {
  const facts = await readAll();
  const added: MemoryFact[] = [];

  for (const raw of texts) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (isDuplicate(facts, trimmed)) continue;
    const now = nextTimestamp();
    const fact: MemoryFact = {
      id: makeId(),
      text: trimmed,
      source,
      createdAt: now,
      updatedAt: now,
    };
    facts.push(fact);
    added.push(fact);
  }

  if (added.length > 0) await writeAll(facts);
  return added;
}

export async function updateFact(id: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const facts = await readAll();
  const index = facts.findIndex(f => f.id === id);
  if (index === -1) return;
  facts[index] = { ...facts[index], text: trimmed, updatedAt: nextTimestamp() };
  await writeAll(facts);
}

export async function deleteFact(id: string): Promise<void> {
  const facts = await readAll();
  await writeAll(facts.filter(f => f.id !== id));
}

export async function clearAllFacts(): Promise<void> {
  await AsyncStorage.removeItem(MEMORY_KEY);
}

// Bounds how much of the prompt memory can consume — a Live session's
// system prompt should stay small and fast, not grow unboundedly as
// months of facts pile up. Most-recently-updated facts win, on the
// theory that a recently-touched fact (added or edited) is more likely
// to still be true/relevant than one untouched for a long time.
const MAX_FACTS_IN_PROMPT = 40;

/**
 * Renders stored facts as the block of text `geminiLive.ts` /
 * `ambientLive.ts` splice into a Live session's system prompt. Returns
 * an empty string (not a header with nothing under it) when there are
 * no facts yet, so callers can simply concatenate it onto the base
 * persona prompt without a conditional.
 */
export function buildMemoryContextBlock(facts: MemoryFact[]): string {
  if (facts.length === 0) return '';
  const selected = [...facts]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_FACTS_IN_PROMPT);
  const bullets = selected.map(f => `- ${f.text}`).join('\n');
  return `\n\nWhat you already know about this user, from past conversations:\n${bullets}\n\nUse this naturally where it's relevant — don't recite it or announce that you "remember" something unless it genuinely helps the moment.`;
}
