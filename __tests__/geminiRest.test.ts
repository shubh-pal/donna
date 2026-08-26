import { validateGeminiApiKey } from '../src/config/geminiRest';

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
