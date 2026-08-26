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
