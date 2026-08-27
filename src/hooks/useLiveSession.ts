import { useCallback, useEffect, useRef, useState } from 'react';
import { getGeminiApiKey } from '../config/apiKeyStore';
import { GeminiLiveSession } from '../config/geminiLive';
import { MicStreamer } from '../audio/micStreamer';
import { AudioPlaybackQueue } from '../audio/playbackQueue';
import { ensureMicrophonePermission } from '../utils/micPermission';

export type LiveSessionState =
  | 'checking-key'
  | 'no-key'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'muted'
  | 'error';

export type LiveTranscriptEntry = {
  id: number;
  speaker: 'you' | 'donna';
  text: string;
};

/**
 * The continuous-conversation session mechanics shared by the
 * Conversation screen and the onboarding interview — connecting on
 * mount (once an API key exists), streaming the mic continuously with
 * automatic (server-side) voice-activity detection, pausing the mic
 * only while Donna's response audio is playing, and a typed-text path
 * into the same session. See `ConversationScreen.tsx`'s file doc
 * comment for the fuller rationale (unchanged by this extraction).
 *
 * Deliberately does NOT own history persistence or memory extraction —
 * those differ by caller (only the real Conversation screen saves
 * history; both it and onboarding extract memory, but from different
 * sources/with different framing). `onSessionEnd` hands back the final
 * transcript on teardown so each screen can do its own thing with it.
 */
export function useLiveSession(
  buildSetup: () => string,
  onSessionEnd?: (transcript: LiveTranscriptEntry[]) => void,
) {
  const [state, setStateReact] = useState<LiveSessionState>('checking-key');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<LiveTranscriptEntry[]>([]);

  const stateRef = useRef<LiveSessionState>('checking-key');
  const apiKeyRef = useRef<string | null>(null);
  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const micRef = useRef<MicStreamer | null>(null);
  const playbackRef = useRef<AudioPlaybackQueue | null>(null);
  const isQueueActiveRef = useRef(false);
  const turnCompletePendingRef = useRef(false);
  const nextIdRef = useRef(0);
  const currentYouEntryRef = useRef<number | null>(null);
  const currentDonnaEntryRef = useRef<number | null>(null);
  const transcriptRef = useRef<LiveTranscriptEntry[]>([]);
  const buildSetupRef = useRef(buildSetup);
  buildSetupRef.current = buildSetup;
  const onSessionEndRef = useRef(onSessionEnd);
  onSessionEndRef.current = onSessionEnd;

  const setState = useCallback((next: LiveSessionState) => {
    stateRef.current = next;
    setStateReact(next);
  }, []);

  const resetCurrentEntry = useCallback((speaker: 'you' | 'donna') => {
    if (speaker === 'you') currentYouEntryRef.current = null;
    else currentDonnaEntryRef.current = null;
  }, []);

  const appendTranscript = useCallback(
    (speaker: 'you' | 'donna', text: string) => {
      const entryRef =
        speaker === 'you' ? currentYouEntryRef : currentDonnaEntryRef;

      if (entryRef.current !== null) {
        setTranscript(prev => {
          const next = prev.map(entry =>
            entry.id === entryRef.current
              ? { ...entry, text: entry.text + text }
              : entry,
          );
          transcriptRef.current = next;
          return next;
        });
      } else {
        const id = nextIdRef.current++;
        entryRef.current = id;
        setTranscript(prev => {
          const next = [...prev, { id, speaker, text }];
          transcriptRef.current = next;
          return next;
        });
      }
    },
    [],
  );

  const teardown = useCallback(() => {
    micRef.current?.stop();
    sessionRef.current?.close();
    playbackRef.current?.dispose();
    sessionRef.current = null;
    playbackRef.current = null;
    onSessionEndRef.current?.(transcriptRef.current);
  }, []);

  const connect = useCallback(
    (apiKey: string) => {
      setErrorMessage(null);
      setState('connecting');
      resetCurrentEntry('you');
      resetCurrentEntry('donna');
      turnCompletePendingRef.current = false;

      playbackRef.current = new AudioPlaybackQueue(isPlaying => {
        isQueueActiveRef.current = isPlaying;
        if (isPlaying) {
          micRef.current?.stop();
          setState('speaking');
        } else if (turnCompletePendingRef.current) {
          turnCompletePendingRef.current = false;
          resetCurrentEntry('donna');
          if (stateRef.current !== 'muted') {
            micRef.current?.start();
            setState('listening');
          }
        }
      });

      micRef.current = new MicStreamer(base64Chunk => {
        sessionRef.current?.sendAudioChunk(base64Chunk);
      });

      const session = new GeminiLiveSession(
        apiKey,
        {
          onSetupComplete: () => {
            // The mic must never start without RECORD_AUDIO actually
            // granted — on a device where it isn't, the native
            // AudioRecord never properly initializes and
            // MicStreamer.start() crashes the app outright (found via
            // a real device's crash log: IllegalStateException:
            // startRecording() called on an uninitialized
            // AudioRecord). `sessionRef.current !== session` guards
            // against this resolving after the session's been torn
            // down or replaced (e.g. the screen unmounted while the
            // permission prompt was up).
            ensureMicrophonePermission().then(granted => {
              if (sessionRef.current !== session) return;
              if (!granted) {
                setErrorMessage(
                  'Donna needs microphone access to have a conversation — allow it in your device Settings, then try again.',
                );
                setState('error');
                return;
              }
              micRef.current?.start();
              setState('listening');
            });
          },
          onInputTranscript: text => appendTranscript('you', text),
          onOutputTranscript: text => appendTranscript('donna', text),
          onAudioChunk: (data, mimeType) =>
            playbackRef.current?.enqueue(data, mimeType),
          onTurnComplete: () => {
            resetCurrentEntry('you');
            // Whatever's still buffered below the coalescing threshold
            // is the tail of this turn's audio — flush it now so it
            // doesn't sit unplayed. This can itself start playback
            // (onPlayingChange fires synchronously — see
            // playbackQueue.ts), so it must happen before the
            // isQueueActiveRef check below.
            playbackRef.current?.flush();
            if (isQueueActiveRef.current) {
              turnCompletePendingRef.current = true;
            } else {
              resetCurrentEntry('donna');
              if (stateRef.current !== 'muted') setState('listening');
            }
          },
          onInterrupted: () => playbackRef.current?.clear(),
          onError: message => {
            setErrorMessage(message);
            setState('error');
          },
          onClose: () => {
            if (stateRef.current !== 'error') {
              setErrorMessage('Lost connection to Donna.');
              setState('error');
            }
          },
        },
        buildSetupRef.current,
      );
      sessionRef.current = session;
      session.connect();
    },
    [appendTranscript, resetCurrentEntry, setState],
  );

  /** Re-reads the stored API key and connects if one's there — the mount effect below is just this run once, cancellably. */
  const attemptConnect = useCallback(
    (isCancelled: () => boolean) => {
      getGeminiApiKey().then(key => {
        if (isCancelled()) return;
        if (!key) {
          setState('no-key');
          return;
        }
        apiKeyRef.current = key;
        connect(key);
      });
    },
    [connect, setState],
  );

  useEffect(() => {
    let cancelled = false;
    attemptConnect(() => cancelled);
    return () => {
      cancelled = true;
      teardown();
    };
    // Intentionally run once per mount — see ConversationScreen.tsx.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Re-checks and reconnects. Two distinct cases share this one
   * function: an actual connection error (`apiKeyRef` is already set —
   * reconnect with the same key), and "no-key" (nothing to reconnect
   * with — this is what a tab screen should call when it regains focus
   * after the user adds a key in Settings, since a tab screen mounts
   * once and is never remounted just by switching tabs back to it — the
   * original mount effect's "no key yet" check would otherwise never
   * run again).
   */
  const retry = useCallback(() => {
    if (apiKeyRef.current) {
      connect(apiKeyRef.current);
    } else {
      attemptConnect(() => false);
    }
  }, [attemptConnect, connect]);

  const toggleMic = useCallback(() => {
    if (stateRef.current === 'listening') {
      micRef.current?.stop();
      sessionRef.current?.endAudioStream();
      setState('muted');
    } else if (stateRef.current === 'muted') {
      micRef.current?.start();
      setState('listening');
    }
  }, [setState]);

  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !sessionRef.current) return;
      resetCurrentEntry('you');
      resetCurrentEntry('donna');
      const id = nextIdRef.current++;
      setTranscript(prev => {
        const next = [...prev, { id, speaker: 'you' as const, text: trimmed }];
        transcriptRef.current = next;
        return next;
      });
      sessionRef.current.sendText(trimmed);
      setState('thinking');
    },
    [resetCurrentEntry, setState],
  );

  return { state, errorMessage, transcript, retry, toggleMic, sendText };
}
