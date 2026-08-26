import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ChatBubble from '../components/ChatBubble';
import ChatInputBar from '../components/ChatInputBar';
import ListeningBlob from '../components/ListeningBlob';
import PrimaryButton from '../components/PrimaryButton';
import { colors, fonts, spacing } from '../theme/colors';
import { getGeminiApiKey } from '../config/apiKeyStore';
import { GeminiLiveSession } from '../config/geminiLive';
import { MicStreamer } from '../audio/micStreamer';
import { AudioPlaybackQueue } from '../audio/playbackQueue';
import { saveSession, type HistoryMessage } from '../config/historyStore';
import type { HomeTabParamList, SettingsStackParamList } from '../navigation/types';

type Props = BottomTabScreenProps<HomeTabParamList, 'Conversation'>;

type ConversationState =
  | 'checking-key'
  | 'no-key'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'muted'
  | 'error';

type TranscriptEntry = { id: number; speaker: 'you' | 'donna'; text: string };

const STATUS_LABEL: Record<ConversationState, string> = {
  'checking-key': 'One sec…',
  'no-key': 'Set up your API key',
  connecting: 'Connecting…',
  listening: 'Online',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  muted: 'Muted',
  error: 'Reconnecting…',
};

const FOCUS_CAPTION: Partial<Record<ConversationState, string>> = {
  listening: "I'm listening. Speak naturally.",
  thinking: 'One sec…',
  speaking: 'Here you go…',
  muted: 'Microphone is off.',
};

/**
 * The merged conversation screen: one continuous, hands-free session —
 * no hold-to-talk. The mic streams the whole time this screen is
 * focused and unmuted; Gemini Live's own automatic voice-activity
 * detection (not disabled anywhere in `buildSetupMessage`) finds each
 * turn's boundary from the silence in that continuous stream, so the
 * app never has to mark "that's one turn" itself — it only pauses the
 * mic while Donna is actually speaking, to avoid the phone hearing its
 * own voice back. Typed messages (`ChatInputBar`) are a second way into
 * the same session, sent as a complete `clientContent` turn.
 *
 * Unverified against a real Gemini Live session on real microphone
 * hardware for *this* continuous-mode rewrite specifically — the
 * previous hold-to-talk version was device-verified; see NOTES.md.
 */
export default function ConversationScreen({}: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();

  const [state, setStateReact] = useState<ConversationState>('checking-key');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [focusMode, setFocusMode] = useState(false);

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
  const sessionIdRef = useRef(`session-${Date.now()}`);
  const historyMessagesRef = useRef<HistoryMessage[]>([]);
  // Parallel to currentYouEntryRef/currentDonnaEntryRef, but indexing
  // into historyMessagesRef instead of the transcript's own ids — kept
  // separate so a streaming update knows exactly which history entry to
  // grow without re-deriving it.
  const historyIndexBySpeakerRef = useRef<{ you: number | null; donna: number | null }>(
    { you: null, donna: null },
  );

  const setConversationState = useCallback((next: ConversationState) => {
    stateRef.current = next;
    setStateReact(next);
  }, []);

  /** Closes out the in-progress streaming entry for one speaker (turn boundary, new turn starting, etc). */
  const resetCurrentEntry = useCallback((speaker: 'you' | 'donna') => {
    if (speaker === 'you') currentYouEntryRef.current = null;
    else currentDonnaEntryRef.current = null;
    historyIndexBySpeakerRef.current[speaker] = null;
  }, []);

  const persistHistory = useCallback(() => {
    if (historyMessagesRef.current.length === 0) return;
    saveSession(sessionIdRef.current, historyMessagesRef.current).catch(
      () => {
        // Best-effort: history is a convenience, not load-bearing.
      },
    );
  }, []);

  const appendTranscript = useCallback(
    (speaker: 'you' | 'donna', text: string) => {
      const entryRef =
        speaker === 'you' ? currentYouEntryRef : currentDonnaEntryRef;

      if (entryRef.current !== null) {
        const historyIndex = historyIndexBySpeakerRef.current[speaker];
        if (historyIndex !== null) {
          historyMessagesRef.current[historyIndex].text += text;
        }
        setTranscript(prev =>
          prev.map(entry =>
            entry.id === entryRef.current
              ? { ...entry, text: entry.text + text }
              : entry,
          ),
        );
      } else {
        const id = nextIdRef.current++;
        entryRef.current = id;
        historyIndexBySpeakerRef.current[speaker] =
          historyMessagesRef.current.push({ speaker, text }) - 1;
        setTranscript(prev => [...prev, { id, speaker, text }]);
      }

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
    persistHistory();
  }, [persistHistory]);

  const connect = useCallback(
    (apiKey: string) => {
      setErrorMessage(null);
      setConversationState('connecting');
      resetCurrentEntry('you');
      resetCurrentEntry('donna');
      turnCompletePendingRef.current = false;

      playbackRef.current = new AudioPlaybackQueue(isPlaying => {
        isQueueActiveRef.current = isPlaying;
        if (isPlaying) {
          // Pause capture while Donna is talking so the mic doesn't pick
          // up her own voice through the speaker (no hardware echo
          // cancellation to rely on here) — resumed the moment she's done.
          micRef.current?.stop();
          setConversationState('speaking');
        } else if (turnCompletePendingRef.current) {
          turnCompletePendingRef.current = false;
          resetCurrentEntry('donna');
          if (stateRef.current !== 'muted') {
            micRef.current?.start();
            setConversationState('listening');
          }
        }
      });

      micRef.current = new MicStreamer(base64Chunk => {
        sessionRef.current?.sendAudioChunk(base64Chunk);
      });

      const session = new GeminiLiveSession(apiKey, {
        onSetupComplete: () => {
          micRef.current?.start();
          setConversationState('listening');
        },
        onInputTranscript: text => appendTranscript('you', text),
        onOutputTranscript: text => appendTranscript('donna', text),
        onAudioChunk: (data, mimeType) =>
          playbackRef.current?.enqueue(data, mimeType),
        onTurnComplete: () => {
          resetCurrentEntry('you');
          if (isQueueActiveRef.current) {
            turnCompletePendingRef.current = true;
          } else {
            resetCurrentEntry('donna');
            if (stateRef.current !== 'muted') {
              setConversationState('listening');
            }
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
    [appendTranscript, resetCurrentEntry, setConversationState],
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

  const handleToggleMic = () => {
    if (stateRef.current === 'listening') {
      micRef.current?.stop();
      sessionRef.current?.endAudioStream();
      setConversationState('muted');
    } else if (stateRef.current === 'muted') {
      micRef.current?.start();
      setConversationState('listening');
    }
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text || !sessionRef.current) return;
    resetCurrentEntry('you');
    resetCurrentEntry('donna');
    historyMessagesRef.current.push({ speaker: 'you', text });
    setTranscript(prev => [
      ...prev,
      { id: nextIdRef.current++, speaker: 'you', text },
    ]);
    sessionRef.current.sendText(text);
    setDraft('');
    setConversationState('thinking');
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: true }),
    );
  };

  if (state === 'no-key') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.noKeyBody}>
          <Text style={styles.wordmark}>Donna</Text>
          <View style={styles.card}>
            <Text style={styles.cardBody}>
              Conversation mode needs your own Gemini API key. Add one in
              Settings and come back here.
            </Text>
            <PrimaryButton
              title="Go to Settings"
              onPress={() =>
                navigation.getParent()?.navigate('SettingsTab' as never)
              }
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (focusMode) {
    const isActive = state === 'listening';
    return (
      <SafeAreaView style={styles.focusSafeArea} edges={['top', 'bottom']}>
        <View style={styles.focusBody}>
          <Text style={styles.focusTitle}>Donna</Text>
          <Text style={styles.focusStatus}>{STATUS_LABEL[state]}</Text>
          <View style={styles.focusBlobWrap}>
            <ListeningBlob active={isActive || state === 'speaking'} />
          </View>
          <Text style={styles.focusCaption}>
            {FOCUS_CAPTION[state] ?? "I'm listening. Speak naturally."}
          </Text>
        </View>
        <PrimaryButton
          title={state === 'muted' ? 'Resume Listening' : 'Stop Listening'}
          variant="secondary"
          onPress={() => {
            if (state !== 'muted') handleToggleMic();
            setFocusMode(false);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() =>
            navigation.getParent()?.navigate('SettingsTab' as never)
          }
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.headerIcon}>☰</Text>
        </TouchableOpacity>
        <Pressable
          style={styles.headerCenter}
          onPress={() => setFocusMode(true)}
        >
          <Text style={styles.headerTitle}>Donna</Text>
          <Text
            style={[
              styles.headerStatus,
              state === 'listening' && styles.headerStatusOnline,
            ]}
          >
            {STATUS_LABEL[state]}
          </Text>
        </Pressable>
        <Text style={styles.headerIcon}>🛡</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.transcriptScroll}
        contentContainerStyle={styles.transcriptContent}
        keyboardShouldPersistTaps="handled"
      >
        {transcript.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Good morning.</Text>
            <Text style={styles.emptySubtitle}>
              What can I help you with today?
            </Text>
          </View>
        ) : (
          transcript.map(entry => (
            <ChatBubble
              key={entry.id}
              speaker={entry.speaker}
              text={entry.text}
            />
          ))
        )}
      </ScrollView>

      {state === 'error' ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <PrimaryButton title="Try again" onPress={handleRetry} />
        </View>
      ) : (
        <View style={styles.inputWrap}>
          <ChatInputBar
            value={draft}
            onChangeText={setDraft}
            onSend={handleSend}
            micActive={state === 'listening' || state === 'speaking'}
            onToggleMic={handleToggleMic}
            micDisabled={state === 'connecting' || state === 'checking-key'}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerIcon: {
    fontSize: 20,
    color: colors.text,
    width: 28,
    textAlign: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  headerStatus: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  headerStatusOnline: {
    color: colors.success,
  },
  transcriptScroll: {
    flex: 1,
  },
  transcriptContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: spacing.xxl,
  },
  emptyTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    color: colors.text,
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: spacing.xs,
  },
  inputWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
  },
  errorBar: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  noKeyBody: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  wordmark: {
    fontFamily: fonts.display,
    fontStyle: 'italic',
    fontSize: 32,
    color: colors.primaryDark,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderWidth: 1,
    borderRadius: 22,
    padding: spacing.lg,
  },
  cardBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  focusSafeArea: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  focusBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusTitle: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.text,
  },
  focusStatus: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: spacing.xl,
  },
  focusBlobWrap: {
    marginBottom: spacing.xl,
  },
  focusCaption: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },
});
