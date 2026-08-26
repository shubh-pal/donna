/**
 * Native module is not linked under Jest (no native build exists in
 * this sandbox), so these tests exercise the "module unavailable"
 * fallback paths — the same paths a real device hits if ambient mode
 * ships on a platform/build where the native module failed to link.
 * Everything here should fail closed/safe, never throw where a caller
 * would reasonably expect a resolved promise.
 */
import {
  getCurrentAudioRoute,
  isAmbientAudioNativeModuleAvailable,
  isAmbientListeningNative,
  stopAmbientListening,
  subscribeToAmbientAudioChunks,
  subscribeToAmbientForceStopped,
  subscribeToAudioRouteChanges,
} from '../src/native/ambientAudio';
import { isBluetoothOutputActive } from '../src/audio/audioRoute';

describe('ambientAudio native bridge (module unavailable in Jest)', () => {
  it('reports the native module as unavailable', () => {
    expect(isAmbientAudioNativeModuleAvailable).toBe(false);
  });

  it('getCurrentAudioRoute resolves to an empty (non-Bluetooth) route rather than throwing', async () => {
    const route = await getCurrentAudioRoute();
    expect(route).toEqual({ outputs: [] });
    expect(isBluetoothOutputActive(route)).toBe(false);
  });

  it('isAmbientListeningNative resolves to false rather than throwing', async () => {
    await expect(isAmbientListeningNative()).resolves.toBe(false);
  });

  it('stopAmbientListening resolves without throwing even with nothing to stop', async () => {
    await expect(stopAmbientListening()).resolves.toBeUndefined();
  });

  it('subscription helpers return a no-op unsubscribe rather than throwing', () => {
    const unsubscribeChunks = subscribeToAmbientAudioChunks(() => {});
    const unsubscribeRoute = subscribeToAudioRouteChanges(() => {});
    const unsubscribeForceStopped = subscribeToAmbientForceStopped(() => {});

    expect(() => unsubscribeChunks()).not.toThrow();
    expect(() => unsubscribeRoute()).not.toThrow();
    expect(() => unsubscribeForceStopped()).not.toThrow();
  });
});
