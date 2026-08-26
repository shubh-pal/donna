/**
 * Gemini Live setup for **ambient mode**, as opposed to the hold-to-talk
 * setup in `geminiLive.ts` (unchanged, still used by the Conversation
 * screen). Same model, same WebSocket protocol, same message
 * parsing/building (`GeminiLiveSession` from `geminiLive.ts` is reused
 * as-is) — only the system prompt and turn-boundary strategy differ:
 *
 * - **Persona**: ambient mode's system prompt explicitly tells the model
 *   to stay quiet almost all the time and only reply when it has
 *   something genuinely witty or useful to add, and to signal "nothing
 *   worth saying" with an exact token (`AMBIENT_SILENCE_TOKEN`) instead
 *   of generating filler.
 * - **Turn boundaries**: there's no push-to-talk button in ambient mode,
 *   so this setup message doesn't rely on the client sending
 *   `realtimeInput.audioStreamEnd` (that's still fine to omit — the Live
 *   API's automatic voice-activity detection is the default when the
 *   client never disables it, so the server itself decides when the
 *   user has stopped talking and a turn is complete).
 *
 * **Known limitation, documented honestly**: the Live API protocol has
 * no server-side concept of "the model decided not to reply" — every
 * turn produces *some* model output. The silence token is a prompting
 * convention this app enforces client-side (see
 * `shouldSuppressAmbientReply` below): if the model's output transcript
 * for a turn is empty or is just that token, `ambientSession.ts` never
 * plays the associated audio and never surfaces it in any transcript.
 * That means every "she chose not to interject" turn still costs a
 * small amount of the user's Gemini API quota/latency even though
 * nothing is heard — there's no way to avoid that with today's Live API
 * shape. If Google adds a real "stay silent" server signal in the
 * future, this is the file to update.
 */

import { GEMINI_LIVE_MODEL } from './geminiLive';
import {
  canDonnaSpeakThroughThisRoute,
  type AudioRouteInfo,
} from '../audio/audioRoute';

/**
 * The model must output exactly this (and nothing else) when it has
 * nothing worth interjecting. Chosen to be extremely unlikely to appear
 * in a genuine reply, and easy to check for even if it shows up with
 * incidental casing/punctuation/whitespace around it (see
 * `shouldSuppressAmbientReply`).
 */
export const AMBIENT_SILENCE_TOKEN = '<NO_REPLY>';

export const AMBIENT_SYSTEM_PROMPT = `You are Donna — the user's personal assistant, in the spirit of Donna \
Paulsen: sharp, witty, dry sense of humor, unflappable under pressure, and \
extremely competent. Right now you are in AMBIENT MODE: you are passively \
listening to the user's environment in the background, not in an explicit \
conversation. You have NOT been addressed directly and should NOT behave \
like a chatbot answering every input.

Stay silent almost all the time. Only speak up if what you just heard gives \
you something genuinely witty, useful, or worth saying right now — a sharp \
observation, a useful catch (someone about to make a mistake, a question \
you can actually answer well, a genuinely funny aside) — the kind of thing \
a brilliant, present friend would actually say out loud, not filler, not \
"I heard you mention X", and never a running commentary. If you're not sure \
it's worth interrupting, it isn't — say nothing.

When you have nothing worth saying, your entire response must be exactly \
the token ${AMBIENT_SILENCE_TOKEN} and nothing else — no punctuation, no \
extra words, no explanation. This is the overwhelmingly common case; use it \
by default. When you do have something worth saying, keep it short — one or \
two sentences, spoken naturally, like a real interjection, not a monologue. \
Never say you are an AI language model or break character.`;

/**
 * Builds the Live API `setup` message for one ambient-mode session.
 * Deliberately mirrors `buildSetupMessage()` in `geminiLive.ts` (same
 * model, same response modality, same transcription requests) but with
 * `AMBIENT_SYSTEM_PROMPT` in place of the conversational persona — kept
 * as a separate function rather than parameterizing the existing one so
 * Phase 2's hold-to-talk path (and its tests) stay untouched.
 */
export function buildAmbientSetupMessage(): string {
  return JSON.stringify({
    setup: {
      model: GEMINI_LIVE_MODEL,
      systemInstruction: { parts: [{ text: AMBIENT_SYSTEM_PROMPT }] },
      generationConfig: { responseModalities: ['AUDIO'] },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  });
}

/**
 * Decides whether one turn's accumulated output transcript means "Donna
 * chose to say nothing" — the client-side half of the silence-token
 * convention above. Pure and unit-tested: this is a *content* gate
 * (should this turn be spoken at all?), distinct from and in addition to
 * the Bluetooth-route gate in `audio/audioRoute.ts` (should it be spoken
 * *right now, through this route*?) — `ambientSession.ts` must pass both
 * before ever enqueuing audio for playback.
 *
 * Treats an empty/whitespace-only transcript as "suppress" too (a turn
 * with no output transcript at all has nothing to say by definition),
 * and matches the token case-insensitively with surrounding punctuation/
 * whitespace stripped, since a model can be inconsistent about exact
 * formatting even when explicitly instructed.
 */
export function shouldSuppressAmbientReply(
  outputTranscript: string | null | undefined,
): boolean {
  if (!outputTranscript) return true;
  const normalized = outputTranscript
    .trim()
    .toUpperCase()
    .replace(/^[\s"'.,!?]+|[\s"'.,!?]+$/g, '');
  if (!normalized) return true;
  return normalized === AMBIENT_SILENCE_TOKEN.toUpperCase();
}

/**
 * The single gate `useAmbientMode.ts` calls once a turn is complete and
 * before ever enqueuing that turn's buffered audio for playback: is this
 * a genuine reply (the content gate above), AND is a Bluetooth output
 * currently connected (the safety gate in `audio/audioRoute.ts`)? Both
 * must hold — a witty reply is still suppressed with no Bluetooth
 * connected, and a connected Bluetooth device doesn't make the silence
 * token speakable.
 *
 * Pure and unit-tested like its two halves; the orchestration layer
 * should call this rather than re-deriving the combination, so there is
 * exactly one place "may Donna speak this turn?" is decided.
 */
export function shouldPlayAmbientTurn(
  outputTranscript: string | null | undefined,
  route: AudioRouteInfo | null | undefined,
): boolean {
  if (shouldSuppressAmbientReply(outputTranscript)) return false;
  return canDonnaSpeakThroughThisRoute(route);
}
