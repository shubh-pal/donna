/**
 * Test-time mocks for native modules that don't run under Jest's Node
 * environment. Referenced via jest.config.js `setupFiles`.
 */

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      store = {};
      return Promise.resolve();
    }),
  };
});

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() => Promise.resolve({ data: { idToken: 'test-token' } })),
    signOut: jest.fn(() => Promise.resolve()),
  },
}));

// In-memory fake keychain, mirroring the one real credential (service ->
// {username, password}) that apiKeyStore.ts stores.
jest.mock('react-native-keychain', () => {
  let store: Record<string, { username: string; password: string }> = {};
  return {
    ACCESSIBLE: {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly',
    },
    SECURITY_LEVEL: { SECURE_HARDWARE: 2, SECURE_SOFTWARE: 1, ANY: 0 },
    setGenericPassword: jest.fn(
      (username: string, password: string, options: any) => {
        store[options.service] = { username, password };
        return Promise.resolve({ service: options.service, storage: 'test' });
      },
    ),
    getGenericPassword: jest.fn((options: any) => {
      const entry = store[options.service];
      if (!entry) return Promise.resolve(false);
      return Promise.resolve({
        ...entry,
        service: options.service,
        storage: 'test',
      });
    }),
    hasGenericPassword: jest.fn((options: any) =>
      Promise.resolve(Boolean(store[options.service])),
    ),
    resetGenericPassword: jest.fn((options: any) => {
      const existed = Boolean(store[options.service]);
      delete store[options.service];
      return Promise.resolve(existed);
    }),
    __resetKeychainForTests: () => {
      store = {};
    },
  };
});

jest.mock('react-native-permissions', () => ({
  PERMISSIONS: {
    IOS: { MICROPHONE: 'ios.microphone', BLUETOOTH: 'ios.bluetooth' },
    ANDROID: {
      RECORD_AUDIO: 'android.record_audio',
      BLUETOOTH_CONNECT: 'android.bluetooth_connect',
    },
  },
  RESULTS: {
    UNAVAILABLE: 'unavailable',
    DENIED: 'denied',
    GRANTED: 'granted',
    BLOCKED: 'blocked',
    LIMITED: 'limited',
  },
  check: jest.fn(() => Promise.resolve('denied')),
  request: jest.fn(() => Promise.resolve('denied')),
  checkNotifications: jest.fn(() =>
    Promise.resolve({ status: 'denied', settings: {} }),
  ),
  requestNotifications: jest.fn(() =>
    Promise.resolve({ status: 'denied', settings: {} }),
  ),
  openSettings: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-live-audio-stream', () => ({
  init: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
  on: jest.fn(),
}));

jest.mock('react-native-sound', () => {
  class FakeSound {
    static setCategory = jest.fn();
    constructor(
      _path: string,
      _basePath: string,
      callback?: (err: unknown) => void,
    ) {
      callback?.(null);
    }
    play(callback?: (success: boolean) => void) {
      callback?.(true);
    }
    release() {}
  }
  return FakeSound;
});

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/tmp',
  writeFile: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
}));
