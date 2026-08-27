import { Platform } from 'react-native';
import {
  check as checkPermission,
  request as requestPermission,
  PERMISSIONS,
  RESULTS,
} from 'react-native-permissions';

export const MICROPHONE_PERMISSION = Platform.select({
  ios: PERMISSIONS.IOS.MICROPHONE,
  android: PERMISSIONS.ANDROID.RECORD_AUDIO,
});

/**
 * Checks (and requests if needed) microphone permission, resolving
 * `true` only once it's actually granted. Shared by every mic-capture
 * path in the app (ambient mode originally; the foreground Conversation/
 * onboarding session too, as of the fix this was pulled out for) —
 * previously only ambient mode called this, and the foreground path
 * would call straight into `MicStreamer.start()` with no permission
 * check at all. On a device where RECORD_AUDIO isn't yet granted, the
 * native `AudioRecord` never properly initializes, and
 * react-native-live-audio-stream's `start()` doesn't check for that
 * before calling `startRecording()` — the result was a hard crash
 * (`IllegalStateException: startRecording() called on an uninitialized
 * AudioRecord`), found via a real device's crash log. Call this and
 * check its result *before* ever calling `MicStreamer.start()`.
 */
export async function ensureMicrophonePermission(): Promise<boolean> {
  if (!MICROPHONE_PERMISSION) return false;
  try {
    const current = await checkPermission(MICROPHONE_PERMISSION as never);
    if (current === RESULTS.GRANTED) return true;
    if (current === RESULTS.BLOCKED) return false;
    const requested = await requestPermission(MICROPHONE_PERMISSION as never);
    return requested === RESULTS.GRANTED;
  } catch {
    return false;
  }
}
