import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { AudioRouteInfo } from '../audio/audioRoute';

/**
 * The JS-side bridge to the native ambient-listening module.
 *
 * - **Android**: backed by a real native module
 *   (`android/app/src/main/java/com/donna/ambient/AmbientAudioModule.kt`)
 *   that starts/stops a foreground `Service`
 *   (`AmbientForegroundService.kt`) doing real `AudioRecord` mic capture
 *   and posts the required persistent notification. This is the fully
 *   wired, real implementation — see NOTES.md "Phase 3" for how it
 *   fits together.
 * - **iOS**: backed by a native module
 *   (`ios/Donna/AmbientAudioModule.swift`) built against `AVAudioEngine`
 *   / `AVAudioSession`, written to Apple's documented APIs but **not
 *   compiled or run** in this sandbox (no macOS/Xcode available — see
 *   README/NOTES for exactly what a human needs to verify on a Mac).
 *   Apple's OS-level restrictions on what actually keeps working once
 *   the app is backgrounded/locked are documented in NOTES.md; this
 *   file does not paper over them.
 *
 * Every exported function here is defensive about the native module
 * being unavailable (wrong platform, module not linked yet, Jest) —
 * they resolve to safe "nothing is happening" values rather than
 * throwing, so JS-side orchestration code doesn't need its own
 * try/catch around every native call.
 */

type NativeAmbientAudioModule = {
  /** Starts the Android foreground service / iOS audio engine capture. Resolves once capture has actually started, rejects with a native error otherwise (e.g. permission missing). */
  startAmbientListening(): Promise<void>;
  /** Stops capture and (Android) removes the foreground service + its notification. */
  stopAmbientListening(): Promise<void>;
  /** Whether ambient capture is currently running, per the native side's own bookkeeping — a ground-truth check independent of JS-side state. */
  isAmbientListening(): Promise<boolean>;
  /**
   * The current system audio output route, already normalized to this
   * app's `AudioOutputDeviceType` vocabulary (see audioRoute.ts) by the
   * native side — Android via `AudioManager`/`AudioDeviceInfo`, iOS via
   * `AVAudioSession.currentRoute`.
   */
  getCurrentAudioRoute(): Promise<AudioRouteInfo>;
};

const nativeModule = NativeModules.AmbientAudioModule as
  | NativeAmbientAudioModule
  | undefined;

/**
 * True only when the native module is actually linked for this
 * platform/build. False in Jest, in an Expo Go-style environment, or if
 * a build was produced before this module was linked — callers should
 * treat that as "ambient mode isn't available on this build", not throw.
 */
export const isAmbientAudioNativeModuleAvailable = Boolean(nativeModule);

const emitter = nativeModule
  ? new NativeEventEmitter(
      // iOS's NativeEventEmitter needs the module instance passed in;
      // Android's doesn't use the argument but accepts it harmlessly.
      Platform.OS === 'ios'
        ? (NativeModules.AmbientAudioModule as never)
        : undefined,
    )
  : null;

/** Event name the native side emits one base64 16-bit PCM mic chunk on, matching the format `micStreamer.ts` already produces for hold-to-talk mode. */
export const AMBIENT_AUDIO_CHUNK_EVENT = 'DonnaAmbientAudioChunk';
/** Event name the native side emits on whenever the system audio output route changes (Bluetooth connects/disconnects, headphones plugged in, etc.), so the app can re-check the speak gate without polling. */
export const AMBIENT_ROUTE_CHANGED_EVENT = 'DonnaAmbientRouteChanged';
/** Event name the native side emits if the OS force-stops ambient capture out from under the app (e.g. Android killing the foreground service under memory pressure, iOS suspending the audio session) — JS should treat this the same as the user tapping the kill switch. */
export const AMBIENT_FORCE_STOPPED_EVENT = 'DonnaAmbientForceStopped';

export async function startAmbientListening(): Promise<void> {
  if (!nativeModule) {
    throw new Error(
      'Ambient listening is not available on this build (native module not linked).',
    );
  }
  await nativeModule.startAmbientListening();
}

export async function stopAmbientListening(): Promise<void> {
  if (!nativeModule) return;
  await nativeModule.stopAmbientListening();
}

export async function isAmbientListeningNative(): Promise<boolean> {
  if (!nativeModule) return false;
  try {
    return await nativeModule.isAmbientListening();
  } catch {
    return false;
  }
}

/**
 * The current audio route, or `{ outputs: [] }` (which safely reads as
 * "no Bluetooth output" via `isBluetoothOutputActive`) if the native
 * module is unavailable or the call fails for any reason. Fails closed,
 * same as the rest of this feature.
 */
export async function getCurrentAudioRoute(): Promise<AudioRouteInfo> {
  if (!nativeModule) return { outputs: [] };
  try {
    const route = await nativeModule.getCurrentAudioRoute();
    if (!route || !Array.isArray(route.outputs)) return { outputs: [] };
    return route;
  } catch {
    return { outputs: [] };
  }
}

export function subscribeToAmbientAudioChunks(
  onChunk: (base64Pcm: string) => void,
): () => void {
  if (!emitter) return () => {};
  // NativeEventEmitter's TS types only know about a generic
  // `Object`-typed payload; the real payload shape here is whatever
  // AmbientAudioModule.kt/.swift actually emits (a plain string), which
  // is documented at the event-name constants above.
  const subscription = emitter.addListener(
    AMBIENT_AUDIO_CHUNK_EVENT,
    onChunk as unknown as (...args: readonly object[]) => unknown,
  );
  return () => subscription.remove();
}

export function subscribeToAudioRouteChanges(
  onChange: (route: AudioRouteInfo) => void,
): () => void {
  if (!emitter) return () => {};
  const subscription = emitter.addListener(
    AMBIENT_ROUTE_CHANGED_EVENT,
    onChange as unknown as (...args: readonly object[]) => unknown,
  );
  return () => subscription.remove();
}

export function subscribeToAmbientForceStopped(
  onForceStopped: () => void,
): () => void {
  if (!emitter) return () => {};
  const subscription = emitter.addListener(
    AMBIENT_FORCE_STOPPED_EVENT,
    onForceStopped,
  );
  return () => subscription.remove();
}
