/**
 * A minimal wrapper around the plain REST side of the Gemini API — just
 * enough to validate a user-supplied API key. The Live API (websocket,
 * used by the Conversation screen) lives in `geminiLive.ts`.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type ApiKeyValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'invalid-key' | 'network-error' | 'unknown';
      message: string;
    };

/**
 * Validates a Gemini API key with a lightweight real request — listing
 * available models — rather than a full generation call. This is called
 * directly from the device to Google's API; the key is never sent
 * anywhere else.
 */
export async function validateGeminiApiKey(
  apiKey: string,
): Promise<ApiKeyValidationResult> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason: 'invalid-key',
      message: 'Enter an API key first.',
    };
  }

  let response: Response;
  try {
    response = await fetch(
      `${GEMINI_API_BASE}/models?pageSize=1&key=${encodeURIComponent(trimmed)}`,
      { method: 'GET' },
    );
  } catch {
    return {
      ok: false,
      reason: 'network-error',
      message: 'Could not reach Google. Check your connection and try again.',
    };
  }

  if (response.ok) {
    return { ok: true };
  }

  if (response.status === 400 || response.status === 403) {
    return {
      ok: false,
      reason: 'invalid-key',
      message:
        'That key was rejected by Google. Double-check it and try again.',
    };
  }

  return {
    ok: false,
    reason: 'unknown',
    message: `Google returned an unexpected error (HTTP ${response.status}).`,
  };
}

// A model *alias* rather than a pinned version — Google hot-swaps what
// this points to as new Flash releases ship. Extraction is a best-
// effort background pass (see extractMemoryFacts below), not something
// that needs a specific model's exact behavior guaranteed the way the
// Live API conversation model might, so tracking "current best Flash"
// automatically is the right trade-off here.
const EXTRACTION_MODEL = 'models/gemini-flash-latest';

export type TranscriptTurn = { speaker: 'you' | 'donna'; text: string };

function buildExtractionPrompt(
  transcript: TranscriptTurn[],
  existingFacts: string[],
): string {
  const transcriptText = transcript
    .map(turn => `${turn.speaker === 'you' ? 'User' : 'Donna'}: ${turn.text}`)
    .join('\n');
  const existingText =
    existingFacts.length > 0
      ? existingFacts.map(f => `- ${f}`).join('\n')
      : '(nothing yet)';

  return `You are extracting long-term memory for a personal assistant app called Donna, from one conversation transcript. Output ONLY a JSON array of strings — no markdown, no commentary, no code fences.

Each string should be one short, plainly-stated fact worth remembering about the user long-term: who they are, their role/work, preferences, relationships, recurring topics, communication style, upcoming things they mentioned. Do NOT include facts already in the "already known" list below (even worded differently) — only genuinely new information. Do NOT include anything sensitive/health/financial/political unless the user volunteered it as clearly important to remember. Do NOT include one-off trivia from this single turn that won't matter later. If there is nothing new and worth keeping, output an empty array: []

Already known about this user:
${existingText}

Transcript:
${transcriptText}

Output (JSON array of strings only):`;
}

/**
 * Parses the model's raw text response into a string array — pulled out
 * as its own pure function so the "model didn't follow instructions"
 * cases (markdown code fences, a leading sentence before the JSON,
 * genuinely malformed output) are unit-testable without a network call.
 * Never throws: anything that doesn't parse to a string array is
 * treated as "no facts found" rather than an error, since this is a
 * best-effort background feature that must never surface an error to
 * the user over something as low-stakes as memory extraction.
 */
export function parseExtractedFacts(rawText: string): string[] {
  // Strip a markdown code fence if the model added one despite being
  // asked not to — a very common way instruction-following slips.
  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenceMatch ? fenceMatch[1] : rawText).trim();

  try {
    const parsed = JSON.parse(candidate);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
  } catch {
    return [];
  }
}

/**
 * Best-effort: given one conversation's transcript and the facts
 * already known, asks Gemini's plain REST `generateContent` endpoint
 * (not the Live API — this doesn't need to be real-time) for new facts
 * worth remembering. Never throws — a network error, a bad response, or
 * output that doesn't parse all resolve to an empty array, since a
 * failed memory update should never interrupt or error out the
 * conversation flow it runs after.
 */
export async function extractMemoryFacts(
  apiKey: string,
  transcript: TranscriptTurn[],
  existingFacts: string[],
): Promise<string[]> {
  if (transcript.length === 0) return [];

  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/${EXTRACTION_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: buildExtractionPrompt(transcript, existingFacts) }],
            },
          ],
        }),
      },
    );
    if (!response.ok) return [];

    const json = await response.json();
    const rawText: unknown =
      json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof rawText !== 'string') return [];

    return parseExtractedFacts(rawText);
  } catch {
    return [];
  }
}
