/**
 * A thin client for Google's Gemini Live API — the WebSocket-based
 * "BidiGenerateContent" protocol used for real-time voice conversation.
 *
 * This is a preview API and its exact model IDs and message schema have
 * shifted over time; the shapes below were checked against Google's
 * current docs (https://ai.google.dev/gemini-api/docs/live-api and
 * https://ai.google.dev/api/live) as of this writing. If Google renames
 * or reshapes something, `GEMINI_LIVE_MODEL` and `parseLiveServerMessage`
 * below are the two places to update — see NOTES.md for the "hasn't been
 * exercised against a live session in this environment" caveat.
 */

// Google periodically retires older Live API models; check
// https://ai.google.dev/gemini-api/docs/live-api for the current
// recommended model if this one has been sunset.
export const GEMINI_LIVE_MODEL = 'models/gemini-3.1-flash-live-preview';

const LIVE_WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

// Mic input is sent to the Live API as 16-bit PCM, mono, 16kHz — the
// format Google's docs specify for realtimeInput audio.
export const LIVE_INPUT_SAMPLE_RATE = 16000;
export const LIVE_INPUT_MIME_TYPE = `audio/pcm;rate=${LIVE_INPUT_SAMPLE_RATE}`;

export const DONNA_SYSTEM_PROMPT = `You are Donna — the user's personal assistant, in the spirit of Donna \
Paulsen: sharp, witty, dry sense of humor, unflappable under pressure, and \
extremely competent. You call things exactly as they are and don't \
sugarcoat, occasionally landing a sarcastic line, but you always have the \
user's back and clearly want them to win. Keep replies concise and \
conversational, like a sharp person actually talking — not a formal \
assistant reading a script, and never a wall of text. Never say you are \
an AI language model or break character. If you don't know something, \
say so plainly instead of hedging.`;

export const ONBOARDING_SYSTEM_PROMPT = `You are Donna — in the spirit of Donna Paulsen: sharp, witty, dry sense \
of humor, unflappable, extremely competent. This is the very first time \
you're meeting this user. Your job right now is NOT a normal conversation \
— it's a short, warm getting-to-know-you interview, like a great new \
assistant would actually do on day one.

Ask about things that would genuinely help you assist them well later: \
their name, what they do (work/studies), what they're currently focused \
on or juggling, how they like to communicate (brief and direct vs. more \
detail, formal vs. casual), and anything else that comes up naturally — \
interests, people they mention often, recurring commitments. Ask ONE \
question at a time, actually listen to the answer before moving on, and \
let it flow like a real conversation, not a form. Keep it to a handful of \
questions — five or six exchanges is plenty, not an interrogation.

Once you feel you have a genuinely useful first picture of who they are, \
wrap up warmly and let them know you're all set — say something like \
"Alright, I've got what I need for now" so it's clear the interview is \
winding down. Keep every turn short and conversational, like Donna \
actually talking. Never say you are an AI language model or break \
character.`;

/**
 * Splices a memory-context block (from `memoryStore.buildMemoryContextBlock`)
 * onto a base persona prompt. A no-op (returns `basePrompt` unchanged)
 * when there's no memory yet — callers can pass `''` unconditionally
 * rather than branching. Shared by the conversation, ambient, and
 * onboarding setup builders so "how memory gets attached to a persona"
 * has exactly one implementation.
 */
export function withMemoryContext(
  basePrompt: string,
  memoryContext: string,
): string {
  return memoryContext ? `${basePrompt}${memoryContext}` : basePrompt;
}

// ---------------------------------------------------------------------
// Server -> client message parsing (pure, unit-tested)
// ---------------------------------------------------------------------

export type LiveServerEvent =
  | { type: 'setupComplete' }
  | { type: 'inputTranscript'; text: string }
  | { type: 'outputTranscript'; text: string }
  | { type: 'audioChunk'; base64Data: string; mimeType: string }
  | { type: 'turnComplete' }
  | { type: 'interrupted' }
  | { type: 'error'; message: string }
  | { type: 'unknown' };

/**
 * Parses one raw Live API server message (already a JSON string — the
 * protocol is JSON text frames, not binary) into a small discriminated
 * union the Conversation screen can switch on. A single raw message can
 * describe more than one thing (e.g. an audio chunk *and* turnComplete),
 * so this returns an array.
 */
export function parseLiveServerMessage(raw: string): LiveServerEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [
      { type: 'error', message: 'Received a non-JSON message from Gemini.' },
    ];
  }

  if (!parsed || typeof parsed !== 'object') return [{ type: 'unknown' }];
  const message = parsed as Record<string, unknown>;
  const events: LiveServerEvent[] = [];

  if ('setupComplete' in message) {
    events.push({ type: 'setupComplete' });
  }

  if (typeof message.error === 'object' && message.error !== null) {
    const errorObj = message.error as { message?: string };
    events.push({
      type: 'error',
      message: errorObj.message ?? 'Gemini Live reported an error.',
    });
  }

  const serverContent = message.serverContent as
    | {
        modelTurn?: {
          parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
        };
        inputTranscription?: { text?: string };
        outputTranscription?: { text?: string };
        turnComplete?: boolean;
        interrupted?: boolean;
      }
    | undefined;

  if (serverContent) {
    const inputText = serverContent.inputTranscription?.text;
    if (inputText) events.push({ type: 'inputTranscript', text: inputText });

    const outputText = serverContent.outputTranscription?.text;
    if (outputText) events.push({ type: 'outputTranscript', text: outputText });

    for (const part of serverContent.modelTurn?.parts ?? []) {
      const inlineData = part.inlineData;
      if (inlineData?.data) {
        events.push({
          type: 'audioChunk',
          base64Data: inlineData.data,
          mimeType: inlineData.mimeType ?? 'audio/pcm;rate=24000',
        });
      }
    }

    if (serverContent.interrupted) events.push({ type: 'interrupted' });
    if (serverContent.turnComplete) events.push({ type: 'turnComplete' });
  }

  return events.length ? events : [{ type: 'unknown' }];
}

// ---------------------------------------------------------------------
// Client -> server message builders (pure, unit-tested)
// ---------------------------------------------------------------------

/**
 * @param memoryContext From `memoryStore.buildMemoryContextBlock` — the
 * facts Donna already knows about this user, spliced onto the base
 * persona via `withMemoryContext`. Defaults to `''` (no memory attached)
 * so every existing call site keeps working unchanged.
 */
export function buildSetupMessage(memoryContext = ''): string {
  return JSON.stringify({
    setup: {
      model: GEMINI_LIVE_MODEL,
      systemInstruction: {
        parts: [{ text: withMemoryContext(DONNA_SYSTEM_PROMPT, memoryContext) }],
      },
      generationConfig: { responseModalities: ['AUDIO'] },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  });
}

/**
 * The onboarding interview's setup message — same shape as
 * `buildSetupMessage`, `ONBOARDING_SYSTEM_PROMPT` in place of the
 * regular persona. No memory context: the whole point of this session
 * is to *create* the first memory, there's nothing to attach yet.
 */
export function buildOnboardingSetupMessage(): string {
  return JSON.stringify({
    setup: {
      model: GEMINI_LIVE_MODEL,
      systemInstruction: { parts: [{ text: ONBOARDING_SYSTEM_PROMPT }] },
      generationConfig: { responseModalities: ['AUDIO'] },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  });
}

export function buildAudioChunkMessage(base64Pcm: string): string {
  return JSON.stringify({
    realtimeInput: {
      audio: { data: base64Pcm, mimeType: LIVE_INPUT_MIME_TYPE },
    },
  });
}

export function buildAudioStreamEndMessage(): string {
  return JSON.stringify({ realtimeInput: { audioStreamEnd: true } });
}

/**
 * A typed message from the user, sent as a `clientContent` turn rather
 * than `realtimeInput` audio. Phase 4's Conversation screen is
 * continuous/hands-free by default, but the input bar also accepts
 * typed text — this is that second path into the same Live session.
 * `turnComplete: true` tells the server this is the whole turn, so it
 * responds immediately rather than waiting for more input.
 */
export function buildTextTurnMessage(text: string): string {
  return JSON.stringify({
    clientContent: {
      turns: [{ role: 'user', parts: [{ text }] }],
      turnComplete: true,
    },
  });
}

export type HistoryTurn = { speaker: 'you' | 'donna'; text: string };

/**
 * Replays a past conversation's messages into a brand-new Live session
 * as `clientContent` history — used to "continue" a saved conversation
 * from the History tab. The Live API protocol has no notion of
 * resuming a previous WebSocket session (it's gone once closed); this
 * is the documented way to give a *new* session the same context: send
 * the prior turns up front, alternating `user`/`model` roles, with
 * `turnComplete: false` so the model ingests them as background
 * without generating a fresh reply to old messages the moment it
 * connects. The next *real* turn (mic audio or a typed message) is
 * what actually gets a response.
 */
export function buildHistoryPrimingMessage(turns: HistoryTurn[]): string {
  return JSON.stringify({
    clientContent: {
      turns: turns.map(turn => ({
        role: turn.speaker === 'you' ? 'user' : 'model',
        parts: [{ text: turn.text }],
      })),
      turnComplete: false,
    },
  });
}

/**
 * Decodes whatever a Live API WebSocket `onmessage` handed us into a
 * UTF-8 string. The server sends its JSON frames as *binary* WebSocket
 * frames — with `ws.binaryType = 'arraybuffer'` (set in `connect()`
 * below) that arrives here as an ArrayBuffer, which this decodes by
 * hand rather than relying on `TextDecoder` (not guaranteed to exist on
 * Hermes/React Native without an extra polyfill). A handful of
 * environments (older RN WebSocket shims, some test runners) may still
 * hand back a plain string, which is passed through unchanged.
 */
export function decodeServerMessageData(data: unknown): string {
  if (typeof data === 'string') return data;

  const bytes =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : ArrayBuffer.isView(data as ArrayBufferView)
        ? new Uint8Array(
            (data as ArrayBufferView).buffer,
            (data as ArrayBufferView).byteOffset,
            (data as ArrayBufferView).byteLength,
          )
        : null;

  if (!bytes) return String(data);

  // Manual UTF-8 decode: JSON text is always valid UTF-8, and this
  // avoids depending on a global TextDecoder that may not exist.
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i += 1;
    } else if (b0 >= 0xc0 && b0 < 0xe0 && i + 1 < bytes.length) {
      const cp = ((b0 & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      out += String.fromCharCode(cp);
      i += 2;
    } else if (b0 >= 0xe0 && b0 < 0xf0 && i + 2 < bytes.length) {
      const cp =
        ((b0 & 0x0f) << 12) |
        ((bytes[i + 1] & 0x3f) << 6) |
        (bytes[i + 2] & 0x3f);
      out += String.fromCharCode(cp);
      i += 3;
    } else if (b0 >= 0xf0 && i + 3 < bytes.length) {
      const cp =
        ((b0 & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      // Surrogate pair for characters outside the BMP.
      const adjusted = cp - 0x10000;
      out += String.fromCharCode(
        0xd800 + (adjusted >> 10),
        0xdc00 + (adjusted & 0x3ff),
      );
      i += 4;
    } else {
      // Malformed byte — skip it rather than corrupt the rest of the
      // decode.
      i += 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Session wrapper
// ---------------------------------------------------------------------

export type LiveSessionEvents = {
  onOpen?: () => void;
  onSetupComplete?: () => void;
  onInputTranscript?: (text: string) => void;
  onOutputTranscript?: (text: string) => void;
  onAudioChunk?: (base64Data: string, mimeType: string) => void;
  onTurnComplete?: () => void;
  onInterrupted?: () => void;
  onError?: (message: string) => void;
  onClose?: (code: number, reason: string) => void;
};

/**
 * Wraps one Gemini Live websocket connection. One instance = one
 * conversation session; create a new one to reconnect.
 *
 * Not unit-tested directly (it's a thin, mostly-side-effecting shell
 * around the platform WebSocket) — the message building/parsing it
 * delegates to above is what's covered by tests. It hasn't been
 * exercised against a live Gemini session in this sandbox; see
 * NOTES.md.
 */
export class GeminiLiveSession {
  private ws: WebSocket | null = null;

  /**
   * @param buildSetup Builds the `setup` message sent once the socket
   * opens. Defaults to the hold-to-talk persona (`buildSetupMessage`);
   * ambient mode passes `buildAmbientSetupMessage` from `ambientLive.ts`
   * instead so the two modes can share this same session shell (websocket
   * lifecycle, message parsing, audio send/close) while only differing in
   * persona/turn-boundary intent.
   */
  constructor(
    private readonly apiKey: string,
    private readonly events: LiveSessionEvents,
    private readonly buildSetup: () => string = buildSetupMessage,
  ) {}

  connect(): void {
    const url = `${LIVE_WS_URL}?key=${encodeURIComponent(this.apiKey)}`;
    const ws = new WebSocket(url);
    // The Live API sends its JSON frames over the *binary* WebSocket
    // opcode, not the text opcode — React Native's WebSocket defaults
    // binaryType to 'blob', which then hands onmessage a Blob (not a
    // string) for every server message. Requesting 'arraybuffer' instead
    // gives onmessage a plain ArrayBuffer we can UTF-8 decode ourselves,
    // without needing a Blob-reading round trip.
    // React Native's WebSocket really does support `binaryType` at
    // runtime (see Libraries/WebSocket/WebSocket.js) — it's just missing
    // from the ambient `WebSocket` type TS picks up here, so a plain
    // assignment doesn't typecheck.
    (ws as unknown as { binaryType: 'arraybuffer' | 'blob' }).binaryType =
      'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.events.onOpen?.();
      ws.send(this.buildSetup());
    };

    ws.onmessage = event => {
      const raw = decodeServerMessageData(event.data);
      for (const serverEvent of parseLiveServerMessage(raw)) {
        this.dispatch(serverEvent);
      }
    };

    ws.onerror = () => {
      this.events.onError?.('Connection to Gemini Live failed.');
    };

    ws.onclose = event => {
      this.events.onClose?.(event.code ?? 0, event.reason ?? '');
    };
  }

  private dispatch(event: LiveServerEvent): void {
    switch (event.type) {
      case 'setupComplete':
        this.events.onSetupComplete?.();
        break;
      case 'inputTranscript':
        this.events.onInputTranscript?.(event.text);
        break;
      case 'outputTranscript':
        this.events.onOutputTranscript?.(event.text);
        break;
      case 'audioChunk':
        this.events.onAudioChunk?.(event.base64Data, event.mimeType);
        break;
      case 'turnComplete':
        this.events.onTurnComplete?.();
        break;
      case 'interrupted':
        this.events.onInterrupted?.();
        break;
      case 'error':
        this.events.onError?.(event.message);
        break;
      case 'unknown':
        break;
    }
  }

  /** Streams one chunk of 16kHz/16-bit/mono PCM mic audio, base64-encoded. */
  sendAudioChunk(base64Pcm: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(buildAudioChunkMessage(base64Pcm));
    }
  }

  /**
   * Signals the end of the realtime audio input stream — a Live API
   * session concept, not a per-turn one. With automatic (server-side)
   * voice activity detection, which the setup message doesn't disable,
   * the server detects each turn's boundary from silence in the
   * continuously-streamed audio on its own; the app never needs to mark
   * "that's one turn" itself. Call this only when actually done sending
   * audio for the session (e.g. muting or leaving the screen).
   */
  endAudioStream(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(buildAudioStreamEndMessage());
    }
  }

  /** Sends one typed message as a complete turn (the text half of the input bar). */
  sendText(text: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(buildTextTurnMessage(text));
    }
  }

  /** Replays a past conversation into this (freshly-connected) session as context — see buildHistoryPrimingMessage. Call once, right after setupComplete, before the first real turn. */
  primeHistory(turns: HistoryTurn[]): void {
    if (turns.length === 0) return;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(buildHistoryPrimingMessage(turns));
    }
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
