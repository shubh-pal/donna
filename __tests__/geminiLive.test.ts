import {
  buildAudioChunkMessage,
  buildAudioStreamEndMessage,
  buildSetupMessage,
  decodeServerMessageData,
  GEMINI_LIVE_MODEL,
  LIVE_INPUT_MIME_TYPE,
  parseLiveServerMessage,
} from '../src/config/geminiLive';

describe('parseLiveServerMessage', () => {
  it('recognizes setupComplete', () => {
    const events = parseLiveServerMessage(
      JSON.stringify({ setupComplete: {} }),
    );
    expect(events).toEqual([{ type: 'setupComplete' }]);
  });

  it('extracts an input transcript', () => {
    const events = parseLiveServerMessage(
      JSON.stringify({
        serverContent: { inputTranscription: { text: 'hey donna' } },
      }),
    );
    expect(events).toContainEqual({
      type: 'inputTranscript',
      text: 'hey donna',
    });
  });

  it('extracts an output transcript', () => {
    const events = parseLiveServerMessage(
      JSON.stringify({
        serverContent: { outputTranscription: { text: "I'm listening." } },
      }),
    );
    expect(events).toContainEqual({
      type: 'outputTranscript',
      text: "I'm listening.",
    });
  });

  it('extracts one audio chunk per inline data part', () => {
    const raw = JSON.stringify({
      serverContent: {
        modelTurn: {
          parts: [
            { inlineData: { data: 'AAAA', mimeType: 'audio/pcm;rate=24000' } },
            { inlineData: { data: 'BBBB', mimeType: 'audio/pcm;rate=24000' } },
          ],
        },
      },
    });
    const events = parseLiveServerMessage(raw);
    expect(events).toEqual([
      {
        type: 'audioChunk',
        base64Data: 'AAAA',
        mimeType: 'audio/pcm;rate=24000',
      },
      {
        type: 'audioChunk',
        base64Data: 'BBBB',
        mimeType: 'audio/pcm;rate=24000',
      },
    ]);
  });

  it('defaults the mime type when a part omits it', () => {
    const raw = JSON.stringify({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { data: 'AAAA' } }] },
      },
    });
    const events = parseLiveServerMessage(raw);
    expect(events).toEqual([
      {
        type: 'audioChunk',
        base64Data: 'AAAA',
        mimeType: 'audio/pcm;rate=24000',
      },
    ]);
  });

  it('reports turnComplete and interrupted flags', () => {
    expect(
      parseLiveServerMessage(
        JSON.stringify({ serverContent: { turnComplete: true } }),
      ),
    ).toContainEqual({ type: 'turnComplete' });

    expect(
      parseLiveServerMessage(
        JSON.stringify({ serverContent: { interrupted: true } }),
      ),
    ).toContainEqual({ type: 'interrupted' });
  });

  it('can emit multiple events from a single message', () => {
    const raw = JSON.stringify({
      serverContent: {
        outputTranscription: { text: 'done' },
        turnComplete: true,
      },
    });
    const events = parseLiveServerMessage(raw);
    expect(events).toEqual([
      { type: 'outputTranscript', text: 'done' },
      { type: 'turnComplete' },
    ]);
  });

  it('surfaces a top-level error object', () => {
    const events = parseLiveServerMessage(
      JSON.stringify({ error: { message: 'quota exceeded' } }),
    );
    expect(events).toContainEqual({ type: 'error', message: 'quota exceeded' });
  });

  it('returns an error event for malformed JSON instead of throwing', () => {
    expect(() => parseLiveServerMessage('not json')).not.toThrow();
    const events = parseLiveServerMessage('not json');
    expect(events[0].type).toBe('error');
  });

  it('returns unknown for a well-formed but unrecognized message', () => {
    expect(
      parseLiveServerMessage(JSON.stringify({ somethingElse: true })),
    ).toEqual([{ type: 'unknown' }]);
  });
});

describe('outgoing message builders', () => {
  it('builds a setup message with the persona and model', () => {
    const message = JSON.parse(buildSetupMessage());
    expect(message.setup.model).toBe(GEMINI_LIVE_MODEL);
    expect(message.setup.systemInstruction.parts[0].text).toContain('Donna');
    expect(message.setup.generationConfig.responseModalities).toEqual([
      'AUDIO',
    ]);
    expect(message.setup.inputAudioTranscription).toEqual({});
    expect(message.setup.outputAudioTranscription).toEqual({});
  });

  it('builds an audio chunk message with the expected mime type', () => {
    const message = JSON.parse(buildAudioChunkMessage('base64data'));
    expect(message.realtimeInput.audio).toEqual({
      data: 'base64data',
      mimeType: LIVE_INPUT_MIME_TYPE,
    });
  });

  it('builds an audio-stream-end message', () => {
    const message = JSON.parse(buildAudioStreamEndMessage());
    expect(message.realtimeInput.audioStreamEnd).toBe(true);
  });
});

describe('decodeServerMessageData', () => {
  it('passes a plain string through unchanged', () => {
    expect(decodeServerMessageData('{"setupComplete":{}}')).toBe(
      '{"setupComplete":{}}',
    );
  });

  it('decodes an ArrayBuffer of UTF-8 bytes into the original string', () => {
    // The Live API sends its JSON frames as *binary* WebSocket frames —
    // this is the shape `ws.binaryType = 'arraybuffer'` hands onmessage.
    const original = JSON.stringify({
      serverContent: { outputTranscription: { text: 'Consider it done — €5 later.' } },
    });
    const bytes = utf8Encode(original);
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    expect(decodeServerMessageData(buffer)).toBe(original);
  });

  it('decodes a typed-array view (e.g. Uint8Array) the same way', () => {
    const original = '{"setupComplete":{}}';
    const view = utf8Encode(original);
    expect(decodeServerMessageData(view)).toBe(original);
  });

  it('falls back to String() for anything else rather than throwing', () => {
    expect(decodeServerMessageData(42)).toBe('42');
  });
});

/** Minimal UTF-8 encoder for test fixtures (mirrors what TextEncoder would do). */
function utf8Encode(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.codePointAt(i)!;
    if (code > 0xffff) i++; // consumed a low surrogate too
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}
