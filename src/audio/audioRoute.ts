/**
 * Pure logic for one hard safety rule in ambient mode: Donna may only
 * speak out loud through a connected Bluetooth audio device, never
 * through the phone's own speaker or earpiece. This file is the single
 * source of truth for "is that true right now?" — everything else
 * (the ambient session orchestration, the native audio-route bridge)
 * calls into `isBluetoothOutputActive` rather than re-deriving the
 * answer, so there is exactly one place this rule can go wrong.
 *
 * Deliberately dependency-free and side-effect-free so it's trivially
 * unit-testable without mocking any native module — see
 * `__tests__/audioRoute.test.ts`. This is the most safety-critical pure
 * function in the app: a bug here means Donna could speak out loud
 * through the phone's speaker while "ambient mode" is supposed to be
 * silent-unless-Bluetooth, which is exactly the privacy problem ambient
 * mode exists to avoid.
 */

/**
 * A normalized, cross-platform vocabulary for audio output device kinds.
 * The native modules (Android's `AudioManager`/`AudioDeviceInfo`, iOS's
 * `AVAudioSession.currentRoute`) each report their own platform-specific
 * type constants; the native bridge layer (`src/native/ambientAudio.ts`)
 * is responsible for translating those into this shared vocabulary
 * *before* this module ever sees them, so the gating decision below
 * never has to know which platform it's running on.
 */
export type AudioOutputDeviceType =
  | 'bluetooth-a2dp'
  | 'bluetooth-sco'
  | 'bluetooth-le'
  | 'hearing-aid'
  | 'wired-headphones'
  | 'wired-headset'
  | 'usb'
  | 'airplay'
  | 'built-in-speaker'
  | 'built-in-receiver'
  | 'other';

export type AudioOutputDevice = {
  type: AudioOutputDeviceType;
  /** Human-readable device name, if the OS provides one (e.g. "Pixel Buds"). Display-only. */
  name?: string;
};

export type AudioRouteInfo = {
  outputs: AudioOutputDevice[];
};

/**
 * Every device type that counts as "a connected Bluetooth audio output"
 * for the purposes of ambient mode. Classic Bluetooth audio (A2DP,
 * typical headphones/speakers), Bluetooth telephony-quality audio (SCO,
 * used by some headsets/car kits), Bluetooth LE Audio (the newer
 * standard replacing classic BT audio on recent phones), and
 * Bluetooth-connected MFi hearing aids are all real "the user put
 * something in/on their ear on purpose" signals — a wired connection or
 * the phone's own speaker/earpiece are not.
 */
const BLUETOOTH_OUTPUT_TYPES: ReadonlySet<AudioOutputDeviceType> = new Set([
  'bluetooth-a2dp',
  'bluetooth-sco',
  'bluetooth-le',
  'hearing-aid',
]);

/**
 * The core safety gate: is a Bluetooth audio *output* currently active?
 * Fails closed on anything unexpected — `null`/`undefined` input, a
 * missing/malformed `outputs` array, or a route with zero outputs all
 * return `false` (never speak), rather than assuming the best. Ambient
 * mode calls this immediately before every single utterance; it should
 * never be cached or assumed to still hold true from an earlier check.
 */
export function isBluetoothOutputActive(
  route: AudioRouteInfo | null | undefined,
): boolean {
  if (!route || !Array.isArray(route.outputs)) return false;
  return route.outputs.some(output => isBluetoothDeviceType(output?.type));
}

/** Whether a single device-type string is a Bluetooth output type. Fails closed on anything unrecognized. */
export function isBluetoothDeviceType(
  type: AudioOutputDeviceType | string | null | undefined,
): boolean {
  if (!type) return false;
  return BLUETOOTH_OUTPUT_TYPES.has(type as AudioOutputDeviceType);
}

/**
 * The names of any connected Bluetooth outputs, for display in the
 * ambient-mode indicator/Settings (e.g. "Connected: Pixel Buds").
 * Display-only — never used for the gating decision itself.
 */
export function connectedBluetoothDeviceNames(
  route: AudioRouteInfo | null | undefined,
): string[] {
  if (!route || !Array.isArray(route.outputs)) return [];
  return route.outputs
    .filter(output => isBluetoothDeviceType(output?.type))
    .map(output => output.name)
    .filter((name): name is string => Boolean(name && name.trim()));
}

/**
 * The single question the ambient session asks right before letting any
 * spoken reply reach the playback queue: "am I allowed to speak right
 * now?". Today this is exactly `isBluetoothOutputActive`, but callers
 * should use this name at call sites (`ambientSession.ts`) rather than
 * `isBluetoothOutputActive` directly — it documents *why* the check is
 * happening at that call site, and gives a single place to extend the
 * rule later (e.g. also respecting an in-session mute) without touching
 * every call site.
 */
export function canDonnaSpeakThroughThisRoute(
  route: AudioRouteInfo | null | undefined,
): boolean {
  return isBluetoothOutputActive(route);
}
