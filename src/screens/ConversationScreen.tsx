import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ScreenContainer from '../components/ScreenContainer';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, spacing } from '../theme/colors';
import { getGeminiApiKey } from '../config/apiKeyStore';
import { GeminiLiveSession } from '../config/geminiLive';
import { MicStreamer } from '../audio/micStreamer';
import { AudioPlaybackQueue } from '../audio/playbackQueue';
import type { AppStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Conversation'>;

type ConversationState =
  | 'checking-key'
  | 'no-key'
  | 'connecting'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

type TranscriptEntry = { id: number; speaker: 'you' | 'donna'; text: string };

const STATE_CAPTION: Record<ConversationState, string> = {
  'checking-key': 'One sec…',
  'no-key': "You'll need a Gemini API key first.",
  connecting: 'Connecting to Donna…',
  idle: 'Hold the button and talk.',
  listening: "I'm listening.",
  thinking: 'One sec…',
  speaking: 'Donna is speaking…',
  error: "Something went wrong — let's try that again.",
};

/**
 * The tap/hold-to-talk conversation screen: hold the mic button to
 * stream audio to Gemini Live, release to let Donna respond.
 *
 * The websocket session stays open for the whole visit to this screen
 * (one session, many turns) rather than reconnecting per press — closed
 * on unmount. Unverified against a real Gemini Live session or real
 * microphone hardware in this sandbox; see NOTES.md.
 */
export default function ConversationScreen({ navigation }: Props) {
  const [state, setStateReact] = useState<ConversationState>('checking-key');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const stateRef = useRef<ConversationState>('checking-key');
  const apiKeyRef = useRef<string | null>(null);
  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const micRef = useRef<MicStreamer | null>(null);
  const playbackRef = useRef<AudioPlaybackQueue | null>(null);
  const isQueueActiveRef = useRef(false);
  const turnCompletePendingRef = useRef(false);
  const nextIdRef = useRef(0);
  const currentYouEntryRef = useRef<number | null>(null);
  const currentDonnaEntryRef = useRef<number | null>(null);
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);

  const setConversationState = useCallback((next: ConversationState) => {
    stateRef.current = next;
    setStateReact(next);
  }, []);

  const appendTranscript = useCallback(
    (speaker: 'you' | 'donna', text: string) => {
      const entryRef =
        speaker === 'you' ? currentYouEntryRef : currentDonnaEntryRef;
      setTranscript(prev => {
        if (entryRef.current !== null) {
          return prev.map(entry =>
            entry.id === entryRef.current
              ? { ...entry, text: entry.text + text }
              : entry,
          );
        }
        const id = nextIdRef.current++;
        entryRef.current = id;
        return [...prev, { id, speaker, text }];
      });
      requestAnimationFrame(() =>
        scrollRef.current?.scrollToEnd({ animated: true }),
      );
    },
    [],
  );

  const teardown = useCallback(() => {
    micRef.current?.stop();
    sessionRef.current?.close();
    playbackRef.current?.dispose();
    sessionRef.current = null;
    playbackRef.current = null;
  }, []);

  const connect = useCallback(
    (apiKey: string) => {
      setErrorMessage(null);
      setConversationState('connecting');
      currentYouEntryRef.current = null;
      currentDonnaEntryRef.current = null;
      turnCompletePendingRef.current = false;

      playbackRef.current = new AudioPlaybackQueue(isPlaying => {
        isQueueActiveRef.current = isPlaying;
        if (isPlaying) {
          setConversationState('speaking');
        } else if (turnCompletePendingRef.current) {
          turnCompletePendingRef.current = false;
          currentDonnaEntryRef.current = null;
          setConversationState('idle');
        }
      });

      micRef.current = new MicStreamer(base64Chunk => {
        sessionRef.current?.sendAudioChunk(base64Chunk);
      });

      const session = new GeminiLiveSession(apiKey, {
        onSetupComplete: () => setConversationState('idle'),
        onInputTranscript: text => appendTranscript('you', text),
        onOutputTranscript: text => appendTranscript('donna', text),
        onAudioChunk: (data, mimeType) =>
          playbackRef.current?.enqueue(data, mimeType),
        onTurnComplete: () => {
          currentYouEntryRef.current = null;
          if (isQueueActiveRef.current) {
            turnCompletePendingRef.current = true;
          } else {
            currentDonnaEntryRef.current = null;
            setConversationState('idle');
          }
        },
        onInterrupted: () => playbackRef.current?.clear(),
        onError: message => {
          setErrorMessage(message);
          setConversationState('error');
        },
        onClose: () => {
          if (stateRef.current !== 'error') {
            setErrorMessage('Lost connection to Donna.');
            setConversationState('error');
          }
        },
      });
      sessionRef.current = session;
      session.connect();
    },
    [appendTranscript, setConversationState],
  );

  useEffect(() => {
    let cancelled = false;
    getGeminiApiKey().then(key => {
      if (cancelled) return;
      if (!key) {
        setConversationState('no-key');
        return;
      }
      apiKeyRef.current = key;
      connect(key);
    });
    return () => {
      cancelled = true;
      teardown();
    };
    // Intentionally run once per mount — reconnecting on every render
    // would tear down and restart the websocket session constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = () => {
    if (apiKeyRef.current) connect(apiKeyRef.current);
  };

  const handlePressIn = () => {
    if (!['idle', 'speaking'].includes(stateRef.current)) return;
    if (stateRef.current === 'speaking') {
      playbackRef.current?.clear();
      turnCompletePendingRef.current = false;
    }
    currentYouEntryRef.current = null;
    currentDonnaEntryRef.current = null;
    micRef.current?.start();
    setConversationState('listening');
  };

  const handlePressOut = () => {
    if (stateRef.current !== 'listening') return;
    micRef.current?.stop();
    sessionRef.current?.endAudioStream();
    setConversationState('thinking');
  };

  if (state === 'no-key') {
    return (
      <ScreenContainer>
        <Text style={styles.title}>Talk to Donna</Text>
        <View style={styles.card}>
          <Text style={styles.cardBody}>
            Conversation mode needs your own Gemini API key. Add one in Settings
            and come back here.
          </Text>
          <PrimaryButton
            title="Go to Settings"
            onPress={() => navigation.navigate('Settings')}
          />
        </View>
      </ScreenContainer>
    );
  }

  const buttonDisabled = state === 'checking-key' || state === 'connecting';
  const isTalking = state === 'listening';

  return (
    <ScreenContainer scroll={false}>
      <Text style={styles.title}>Talk to Donna</Text>

      <ScrollView
        ref={scrollRef}
        style={styles.transcriptScroll}
        contentContainerStyle={styles.transcriptContent}
      >
        {transcript.length === 0 ? (
          <Text style={styles.placeholder}>
            Your conversation will show up here.
          </Text>
        ) : (
          transcript.map(entry => (
            <View
              key={entry.id}
              style={[
                styles.bubble,
                entry.speaker === 'you' ? styles.bubbleYou : styles.bubbleDonna,
              ]}
            >
              <Text style={styles.bubbleSpeaker}>
                {entry.speaker === 'you' ? 'You' : 'Donna'}
              </Text>
              <Text style={styles.bubbleText}>{entry.text}</Text>
            </View>
          ))
        )}
      </ScrollView>

      {state === 'error' ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <PrimaryButton title="Try again" onPress={handleRetry} />
        </View>
      ) : (
        <>
          <Text style={styles.caption}>{STATE_CAPTION[state]}</Text>
          <Pressable
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={buttonDisabled}
            style={[
              styles.micButton,
              isTalking && styles.micButtonActive,
              state === 'speaking' && styles.micButtonSpeaking,
              buttonDisabled && styles.micButtonDisabled,
            ]}
          >
            <Text style={styles.micButtonText}>
              {isTalking ? '●' : state === 'speaking' ? '♪' : '🎙'}
            </Text>
          </Pressable>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  cardBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  transcriptScroll: {
    flex: 1,
  },
  transcriptContent: {
    paddingBottom: spacing.md,
  },
  placeholder: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  bubble: {
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginBottom: spacing.sm,
    maxWidth: '85%',
  },
  bubbleYou: {
    backgroundColor: colors.surfaceAlt,
    alignSelf: 'flex-end',
  },
  bubbleDonna: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  bubbleSpeaker: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  bubbleText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  caption: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  micButton: {
    alignSelf: 'center',
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  micButtonActive: {
    backgroundColor: colors.danger,
  },
  micButtonSpeaking: {
    backgroundColor: colors.primaryMuted,
  },
  micButtonDisabled: {
    opacity: 0.4,
  },
  micButtonText: {
    fontSize: 32,
  },
  errorBox: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});
