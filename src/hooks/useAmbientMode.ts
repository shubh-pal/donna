import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';
import {
  check as checkPermission,
  request as requestPermission,
  PERMISSIONS,
  RESULTS,
} from 'react-native-permissions';
import {
  getCurrentAudioRoute,
  isAmbientAudioNativeModuleAvailable,
  startAmbientListening as nativeStartAmbientListening,
  stopAmbientListening as nativeStopAmbientListening,
  subscribeToAmbientAudioChunks,
  subscribeToAmbientForceStopped,
  subscribeToAudioRouteChanges,
} from '../native/ambientAudio';
import {
  isBluetoothOutputActive,
  type AudioRouteInfo,
} from '../audio/audioRoute';
import {
  buildAmbientSetupMessage,
  shouldPlayAmbientTurn,
} from '../config/ambientLive';
import { GeminiLiveSession } from '../config/geminiLive';
import { getGeminiApiKey } from '../config/apiKeyStore';
import { buildMemoryContextBlock, listFacts } from '../config/memoryStore';
import {
  getAmbientModeConfirmed,
  getAmbientModeEnabled,
  setAmbientModeConfirmed as persistAmbientModeConfirmed,
  setAmbientModeEnabled as persistAmbientModeEnabled,
} from '../config/preferences';
import { AudioPlaybackQueue } from '../audio/playbackQueue';

export type AmbientPhase =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'speaking'
  | 'error';

const MICROPHONE_PERMISSION = Platform.select({
  ios: PERMISSIONS.IOS.MICROPHONE,
  android: PERMISSIONS.ANDROID.RECORD_AUDIO,
});

/**
 * Short, best-effort haptic pulses marking listening-state transitions —
 * one half of the "persistent visual + haptic listening indicator" the
 * brief asks for (the other half is `AmbientListeningBanner.tsx`'s pulsing
 * dot). Wrapped defensively: `Vibration` shouldn't throw, but a missing
 * haptic on a device that doesn't support it must never break ambient
 * mode itself — the visual indicator still carries the same information.
 * Unverified on real hardware in this sandbox, like the rest of this
 * feature — see NOTES.md.
 */
function pulseHaptic(pattern: number | number[]): void {
  try {
    Vibration.vibrate(pattern);
  } catch {
    // Best-effort only — see comment above.
  }
}

async function ensureMicrophonePermission(): Promise<boolean> {
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

/**
 * Orchestrates ambient mode end to end: persisted on/off intent, the
 * one-time confirmation gate, native mic capture, a Gemini Live ambient
 * session (reusing `GeminiLiveSession` from `geminiLive.ts` with the
 * ambient persona from `ambientLive.ts`), and the Bluetooth-route speak
 * gate (`shouldPlayAmbientTurn`) checked fresh before every single
 * utterance. See NOTES.md "Phase 3" for the full design writeup and its
 * honestly-documented limitations.
 *
 * Meant to be instantiated exactly once, via `AmbientModeContext`, rather
 * than per-screen — navigating away from the Ambient Mode screen must not
 * stop background listening; only the kill switch (`disable`) should.
 *
 * Not unit-tested directly, consistent with this project's convention for
 * side-effecting session/native wiring (`GeminiLiveSession`,
 * `ConversationScreen` are the same) — the logic dense enough to be worth
 * testing in isolation (the content + Bluetooth gate) lives in
 * `shouldPlayAmbientTurn`/`shouldSuppressAmbientReply` in `ambientLive.ts`
 * and *is* unit tested. The one behavior worth calling out here: with no
 * native ambient-audio module linked (true for every build produced in
 * this sandbox — see `native/ambientAudio.ts`), `start()` fails closed
 * immediately and flips the persisted "enabled" flag back off, which
 * `__tests__/ambientAudio.test.ts` covers at the bridge layer this hook
 * depends on.
 */
export function useAmbientMode() {
  const [phase, setPhaseReact] = useState<AmbientPhase>('idle');
  const [enabled, setEnabled] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [bluetoothConnected, setBluetoothConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const phaseRef = useRef<AmbientPhase>('idle');
  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const playbackRef = useRef<AudioPlaybackQueue | null>(null);
  const unsubscribersRef = useRef<Array<() => void>>([]);
  const routeRef = useRef<AudioRouteInfo>({ outputs: [] });
  const turnTranscriptRef = useRef('');
  const turnAudioRef = useRef<Array<{ base64Pcm: string; mimeType: string }>>(
    [],
  );
  // Bumped on every start()/disable() call; async steps from a stale call
  // check this before touching state, so a fast disable-then-enable (or
  // two overlapping start() calls) can't have a late-resolving old start
  // clobber a newer one.
  const startTokenRef = useRef(0);

  const setPhase = useCallback((next: AmbientPhase) => {
    phaseRef.current = next;
    setPhaseReact(next);
  }, []);

  const clearTurnBuffers = useCallback(() => {
    turnTranscriptRef.current = '';
    turnAudioRef.current = [];
  }, []);

  const teardown = useCallback(() => {
    unsubscribersRef.current.forEach(unsubscribe => unsubscribe());
    unsubscribersRef.current = [];
    sessionRef.current?.close();
    sessionRef.current = null;
    playbackRef.current?.dispose();
    playbackRef.current = null;
    clearTurnBuffers();
    nativeStopAmbientListening().catch(() => {});
  }, [clearTurnBuffers]);

  const start = useCallback(async () => {
    if (
      phaseRef.current === 'starting' ||
      phaseRef.current === 'listening' ||
      phaseRef.current === 'speaking'
    ) {
      return; // Already running (or coming up) — nothing to do.
    }

    const token = ++startTokenRef.current;
    setErrorMessage(null);
    setPhase('starting');
    setEnabled(true);

    const fail = async (message: string) => {
      if (startTokenRef.current !== token) return;
      teardown();
      setPhase('error');
      setErrorMessage(message);
      setEnabled(false);
      await persistAmbientModeEnabled(false);
    };

    if (!isAmbientAudioNativeModuleAvailable) {
      await fail(
        'Ambient mode needs a native build with the ambient audio module linked — it is not available in this build. See NOTES.md "Phase 3".',
      );
      return;
    }

    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
      await fail('Add a Gemini API key in Settings first.');
      return;
    }

    const micGranted = await ensureMicrophonePermission();
    if (!micGranted) {
      await fail(
        'Microphone permission is required for ambient mode — allow it in Settings, then try again.',
      );
      return;
    }

    try {
      await nativeStartAmbientListening();
    } catch (error) {
      await fail(
        error instanceof Error
          ? error.message
          : 'Could not start ambient listening.',
      );
      return;
    }
    if (startTokenRef.current !== token) return;

    routeRef.current = await getCurrentAudioRoute();
    setBluetoothConnected(isBluetoothOutputActive(routeRef.current));
    clearTurnBuffers();

    // Best-effort — an empty/failed read just means the ambient
    // session opens with no memory context, same as before this
    // existed, rather than blocking ambient mode from starting at all.
    const memoryContext = await listFacts()
      .then(buildMemoryContextBlock)
      .catch(() => '');
    if (startTokenRef.current !== token) return;

    const playback = new AudioPlaybackQueue(isPlaying => {
      if (startTokenRef.current !== token) return;
      if (isPlaying) {
        pulseHaptic([0, 40, 60, 40]);
        setPhase('speaking');
      } else if (phaseRef.current === 'speaking') {
        setPhase('listening');
      }
    });
    playbackRef.current = playback;

    const session = new GeminiLiveSession(
      apiKey,
      {
        onSetupComplete: () => {
          if (startTokenRef.current !== token) return;
          pulseHaptic(40);
          setPhase('listening');
        },
        onOutputTranscript: text => {
          turnTranscriptRef.current += text;
        },
        onAudioChunk: (base64Pcm, mimeType) => {
          turnAudioRef.current.push({ base64Pcm, mimeType });
        },
        onTurnComplete: () => {
          const transcript = turnTranscriptRef.current;
          const chunks = turnAudioRef.current;
          clearTurnBuffers();
          // The single spoken-reply gate: re-checked against the latest
          // known route right now, immediately before ever queuing audio
          // for playback — never against a stale snapshot (see
          // audioRoute.ts). A suppressed turn (silence token, empty
          // transcript, or no Bluetooth connected) is dropped silently —
          // nothing plays, nothing is queued, listening just continues.
          if (shouldPlayAmbientTurn(transcript, routeRef.current)) {
            chunks.forEach(chunk =>
              playbackRef.current?.enqueue(chunk.base64Pcm, chunk.mimeType),
            );
          }
        },
        onInterrupted: () => {
          clearTurnBuffers();
          playbackRef.current?.clear();
        },
        onError: message => {
          fail(message);
        },
        onClose: () => {
          if (startTokenRef.current !== token) return;
          if (phaseRef.current !== 'error') {
            fail('Lost connection to Donna.');
          }
        },
      },
      () => buildAmbientSetupMessage(memoryContext),
    );
    sessionRef.current = session;
    session.connect();

    const unsubscribeChunks = subscribeToAmbientAudioChunks(base64Pcm => {
      sessionRef.current?.sendAudioChunk(base64Pcm);
    });
    const unsubscribeRoute = subscribeToAudioRouteChanges(route => {
      routeRef.current = route;
      setBluetoothConnected(isBluetoothOutputActive(route));
    });
    const unsubscribeForceStopped = subscribeToAmbientForceStopped(() => {
      fail(
        'Ambient mode was stopped by the system (the OS reclaimed the background service, or the audio session was interrupted).',
      );
    });
    unsubscribersRef.current = [
      unsubscribeChunks,
      unsubscribeRoute,
      unsubscribeForceStopped,
    ];

    await persistAmbientModeEnabled(true);
  }, [clearTurnBuffers, setPhase, teardown]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedEnabled, storedConfirmed] = await Promise.all([
        getAmbientModeEnabled(),
        getAmbientModeConfirmed(),
      ]);
      if (cancelled) return;
      setConfirmed(storedConfirmed);
      setReady(true);
      if (storedEnabled && storedConfirmed) {
        // Best-effort resume of a prior "on" intent. Deliberately never
        // auto-starts without a prior confirmation, and fails closed (see
        // `fail` above) rather than leaving the UI claiming ambient mode
        // is on when e.g. the mic permission was revoked meanwhile.
        start();
      } else if (storedEnabled) {
        await persistAmbientModeEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
      teardown();
    };
    // Runs once, on provider mount — see the file-level doc comment for
    // why this hook is meant to be instantiated exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enable = useCallback(async () => {
    await start();
  }, [start]);

  /** The kill switch: always safe to call, from any phase, at any time. */
  const disable = useCallback(async () => {
    startTokenRef.current += 1; // Invalidate any in-flight start().
    teardown();
    setPhase('idle');
    setErrorMessage(null);
    setEnabled(false);
    pulseHaptic(30);
    await persistAmbientModeEnabled(false);
  }, [setPhase, teardown]);

  const confirmAmbientMode = useCallback(async () => {
    setConfirmed(true);
    await persistAmbientModeConfirmed(true);
  }, []);

  return {
    /** True once the persisted preferences have been read at least once — gates the toggle so it can't flicker on/off while loading. */
    ready,
    phase,
    /** The user's current on/off intent (optimistically true as soon as `enable()` is called, flipped back on failure). */
    enabled,
    /** Whether the one-time ambient-mode confirmation dialog has already been accepted. */
    confirmed,
    bluetoothConnected,
    errorMessage,
    /** Whether this build has the native ambient audio module linked at all. */
    nativeAvailable: isAmbientAudioNativeModuleAvailable,
    enable,
    disable,
    confirmAmbientMode,
  };
}
