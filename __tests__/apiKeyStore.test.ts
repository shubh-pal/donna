import {
  saveGeminiApiKey,
  getGeminiApiKey,
  hasGeminiApiKey,
  clearGeminiApiKey,
} from '../src/config/apiKeyStore';

const keychain = require('react-native-keychain');

beforeEach(() => {
  keychain.__resetKeychainForTests();
  jest.clearAllMocks();
});

describe('apiKeyStore', () => {
  it('returns null when no key has been saved', async () => {
    await expect(getGeminiApiKey()).resolves.toBeNull();
    await expect(hasGeminiApiKey()).resolves.toBe(false);
  });

  it('saves and retrieves a key', async () => {
    await saveGeminiApiKey('test-api-key-123');
    await expect(getGeminiApiKey()).resolves.toBe('test-api-key-123');
    await expect(hasGeminiApiKey()).resolves.toBe(true);
  });

  it('trims whitespace before saving', async () => {
    await saveGeminiApiKey('  spaced-key  ');
    await expect(getGeminiApiKey()).resolves.toBe('spaced-key');
  });

  it('rejects an empty key', async () => {
    await expect(saveGeminiApiKey('   ')).rejects.toThrow();
  });

  it('falls back to default security level if hardware-backed storage throws', async () => {
    keychain.setGenericPassword
      .mockImplementationOnce(() =>
        Promise.reject(new Error('no secure hardware')),
      )
      .mockImplementationOnce(
        (username: string, password: string, options: any) => {
          keychain.getGenericPassword.mockImplementationOnce(() =>
            Promise.resolve({ username, password, service: options.service }),
          );
          return Promise.resolve({ service: options.service });
        },
      );

    await saveGeminiApiKey('fallback-key');
    await expect(getGeminiApiKey()).resolves.toBe('fallback-key');
  });

  it('clears a saved key', async () => {
    await saveGeminiApiKey('to-be-cleared');
    await clearGeminiApiKey();
    await expect(getGeminiApiKey()).resolves.toBeNull();
    await expect(hasGeminiApiKey()).resolves.toBe(false);
  });

  it('replacing a key overwrites the previous value', async () => {
    await saveGeminiApiKey('first-key');
    await saveGeminiApiKey('second-key');
    await expect(getGeminiApiKey()).resolves.toBe('second-key');
  });
});
