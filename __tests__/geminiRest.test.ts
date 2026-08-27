import {
  extractMemoryFacts,
  parseExtractedFacts,
  validateGeminiApiKey,
} from '../src/config/geminiRest';

describe('validateGeminiApiKey', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects an empty key without making a request', async () => {
    globalThis.fetch = jest.fn();
    const result = await validateGeminiApiKey('   ');
    expect(result.ok).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns ok when Google responds successfully', async () => {
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, status: 200 } as Response),
    ) as unknown as typeof fetch;

    const result = await validateGeminiApiKey('good-key');
    expect(result.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('key=good-key'),
      expect.any(Object),
    );
  });

  it('flags a 400/403 response as an invalid key', async () => {
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 400 } as Response),
    ) as unknown as typeof fetch;

    const result = await validateGeminiApiKey('bad-key');
    expect(result).toEqual(
      expect.objectContaining({ ok: false, reason: 'invalid-key' }),
    );
  });

  it('flags other non-ok statuses as an unknown error', async () => {
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 500 } as Response),
    ) as unknown as typeof fetch;

    const result = await validateGeminiApiKey('some-key');
    expect(result).toEqual(
      expect.objectContaining({ ok: false, reason: 'unknown' }),
    );
  });

  it('flags a thrown fetch error as a network error', async () => {
    globalThis.fetch = jest.fn(() =>
      Promise.reject(new Error('offline')),
    ) as unknown as typeof fetch;

    const result = await validateGeminiApiKey('some-key');
    expect(result).toEqual(
      expect.objectContaining({ ok: false, reason: 'network-error' }),
    );
  });

  it('URL-encodes the key in the query string', async () => {
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, status: 200 } as Response),
    ) as unknown as typeof fetch;

    await validateGeminiApiKey('key with spaces');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('key=key%20with%20spaces'),
      expect.any(Object),
    );
  });
});

describe('parseExtractedFacts', () => {
  it('parses a clean JSON array', () => {
    expect(parseExtractedFacts('["Works as a nurse", "Has two cats"]')).toEqual([
      'Works as a nurse',
      'Has two cats',
    ]);
  });

  it('parses JSON wrapped in a markdown code fence', () => {
    const raw = '```json\n["Prefers morning meetings"]\n```';
    expect(parseExtractedFacts(raw)).toEqual(['Prefers morning meetings']);
  });

  it('parses a fenced block with no language tag', () => {
    const raw = '```\n["Lives in Denver"]\n```';
    expect(parseExtractedFacts(raw)).toEqual(['Lives in Denver']);
  });

  it('parses a JSON array the model wrapped in prose despite instructions not to — the real bug that left memory empty after a genuine interview', () => {
    const raw =
      'Sure, here are the facts I picked up from that conversation:\n["Works as a nurse", "Has two cats"]\nLet me know if you need anything else!';
    expect(parseExtractedFacts(raw)).toEqual([
      'Works as a nurse',
      'Has two cats',
    ]);
  });

  it('parses an array preceded by a "thinking" preamble with no fence and no trailing text', () => {
    const raw = 'Thinking about what stood out...\n\n["Prefers email over calls"]';
    expect(parseExtractedFacts(raw)).toEqual(['Prefers email over calls']);
  });

  it('returns an empty array for an empty JSON array', () => {
    expect(parseExtractedFacts('[]')).toEqual([]);
  });

  it('drops non-string and blank entries rather than failing entirely', () => {
    expect(parseExtractedFacts('["real fact", 42, "  ", null]')).toEqual([
      'real fact',
    ]);
  });

  it('returns an empty array for malformed JSON instead of throwing', () => {
    expect(parseExtractedFacts('not json at all')).toEqual([]);
  });

  it('still finds the array even if the model wraps it in an object instead of returning it bare', () => {
    // Not the instructed shape, but the array-extraction regex finds
    // the inner array anyway — more useful than discarding a
    // perfectly good answer over a wrapper the model added.
    expect(parseExtractedFacts('{"facts": ["x"]}')).toEqual(['x']);
  });

  it('returns an empty array when there is no array anywhere in the response', () => {
    expect(parseExtractedFacts('{"facts": "none found"}')).toEqual([]);
  });
});

describe('extractMemoryFacts', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns an empty array without a request for an empty transcript', async () => {
    globalThis.fetch = jest.fn();
    await expect(extractMemoryFacts('key', [], [])).resolves.toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns the parsed facts from a successful response', async () => {
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              { content: { parts: [{ text: '["New fact one"]' }] } },
            ],
          }),
      } as Response),
    ) as unknown as typeof fetch;

    const facts = await extractMemoryFacts(
      'key',
      [{ speaker: 'you', text: 'hello' }],
      [],
    );
    expect(facts).toEqual(['New fact one']);
  });

  it('concatenates multiple response parts rather than only reading the first one', async () => {
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [
              {
                content: {
                  parts: [
                    { text: 'Thinking it over...\n' },
                    { text: '["Fact from a later part"]' },
                  ],
                },
              },
            ],
          }),
      } as Response),
    ) as unknown as typeof fetch;

    const facts = await extractMemoryFacts(
      'key',
      [{ speaker: 'you', text: 'hello' }],
      [],
    );
    expect(facts).toEqual(['Fact from a later part']);
  });

  it('resolves to an empty array on a non-ok response rather than throwing', async () => {
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 500 } as Response),
    ) as unknown as typeof fetch;

    await expect(
      extractMemoryFacts('key', [{ speaker: 'you', text: 'hi' }], []),
    ).resolves.toEqual([]);
  });

  it('resolves to an empty array when fetch throws', async () => {
    globalThis.fetch = jest.fn(() =>
      Promise.reject(new Error('offline')),
    ) as unknown as typeof fetch;

    await expect(
      extractMemoryFacts('key', [{ speaker: 'you', text: 'hi' }], []),
    ).resolves.toEqual([]);
  });
});
