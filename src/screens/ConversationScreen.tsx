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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ChatBubble from '../components/ChatBubble';
import ChatInputBar from '../components/ChatInputBar';
import Icon from '../components/Icon';
import ListeningBlob from '../components/ListeningBlob';
import PrimaryButton from '../components/PrimaryButton';
import { colors, fonts, spacing } from '../theme/colors';
import { getGeminiApiKey } from '../config/apiKeyStore';
import { buildOnboardingSetupMessage, buildSetupMessage } from '../config/geminiLive';
import { extractMemoryFacts } from '../config/geminiRest';
import { saveSession, type HistoryMessage } from '../config/historyStore';
import {
  addFacts,
  buildMemoryContextBlock,
  listFacts,
} from '../config/memoryStore';
import { useLiveSession, type LiveTranscriptEntry } from '../hooks/useLiveSession';
import { useAuth } from '../context/AuthContext';
import type { HomeTabParamList, SettingsStackParamList } from '../navigation/types';

type Props = BottomTabScreenProps<HomeTabParamList, 'Conversation'>;

const STATUS_LABEL: Record<string, string> = {
  'checking-key': 'One sec…',
  'no-key': 'Set up your API key',
  connecting: 'Connecting…',
  listening: 'Online',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  muted: 'Muted',
  error: 'Reconnecting…',
};

const FOCUS_CAPTION: Record<string, string> = {
  listening: "I'm listening. Speak naturally.",
  thinking: 'One sec…',
  speaking: 'Here you go…',
  muted: 'Microphone is off.',
};

function toHistoryMessages(transcript: LiveTranscriptEntry[]): HistoryMessage[] {
  return transcript.map(({ speaker, text }) => ({ speaker, text }));
}

/**
 * The merged conversation screen: one continuous, hands-free session —
 * no hold-to-talk. There is no separate onboarding screen — a user
 * whose onboarding isn't complete yet (`useAuth().onboardingComplete`)
 * gets exactly this screen, with the onboarding persona in place of the
 * regular one, so meeting Donna for the first time feels like the start
 * of an ordinary conversation, not a form or a distinct flow with its
 * own "finish" button. That first conversation ending (leaving this
 * screen, same as any other) is what calls `markOnboardingComplete` —
 * naturally, not via an explicit "I'm done" control.
 *
 * Session mechanics (connect, continuous mic streaming with automatic
 * server-side turn detection, mic pause while Donna speaks, typed-text
 * path) live in `useLiveSession`; what this screen owns is: choosing
 * the persona, the memory-aware system prompt, saving history on
 * teardown, and a best-effort memory-extraction pass over each
 * conversation.
 *
 * Unverified against a real Gemini Live session on real microphone
 * hardware for the continuous-mode rewrite specifically — see NOTES.md.
 */
export default function ConversationScreen({}: Props) {
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const { onboardingComplete, markOnboardingComplete } = useAuth();

  const [draft, setDraft] = useState('');
  const [focusMode, setFocusMode] = useState(false);
  const memoryContextRef = useRef('');
  const sessionIdRef = useRef(`session-${Date.now()}`);
  // Captured once, at mount — RootNavigator only renders this screen
  // once `onboardingComplete` has resolved to an actual boolean, and it
  // must not change mid-session even once markOnboardingComplete() (at
  // the end of *this* session) flips it, or a still-running session
  // would suddenly look like a "regular" one to itself.
  const isOnboardingRef = useRef(onboardingComplete === false);

  const handleSessionEnd = useCallback(
    (transcript: LiveTranscriptEntry[]) => {
      if (transcript.length === 0) return;
      const messages = toHistoryMessages(transcript);
      const wasOnboarding = isOnboardingRef.current;

      saveSession(sessionIdRef.current, messages).catch(() => {});

      // Best-effort, fire-and-forget: never block/slow down leaving this
      // screen on a background API call, and never surface its failure —
      // see extractMemoryFacts' own doc comment for why it already
      // swallows its own errors.
      (async () => {
        const apiKey = await getGeminiApiKey();
        if (!apiKey) return;
        const existing = await listFacts();
        const newFacts = await extractMemoryFacts(
          apiKey,
          messages,
          existing.map(f => f.text),
        );
        if (newFacts.length > 0) {
          await addFacts(newFacts, wasOnboarding ? 'onboarding' : 'conversation');
        }
      })();

      if (wasOnboarding) markOnboardingComplete();
    },
    [markOnboardingComplete],
  );

  // buildSetup is read via ref at the moment the websocket actually
  // opens (see useLiveSession/GeminiLiveSession), not at render time —
  // so it's safe for this closure to reference memoryContextRef even
  // though the effect below that populates it runs concurrently with
  // (not strictly before) the hook's own connect-on-mount effect. The
  // local AsyncStorage read memory depends on is expected to resolve
  // well before the WS handshake does.
  const buildSetup = useCallback(
    () =>
      isOnboardingRef.current
        ? buildOnboardingSetupMessage()
        : buildSetupMessage(memoryContextRef.current),
    [],
  );

  useEffect(() => {
    if (isOnboardingRef.current) return; // nothing to attach yet
    listFacts().then(facts => {
      memoryContextRef.current = buildMemoryContextBlock(facts);
    });
  }, []);

  const { state, errorMessage, transcript, retry, toggleMic, sendText } =
    useLiveSession(buildSetup, handleSessionEnd);

  // The Home tab is never remounted just by switching tabs (React
  // Navigation keeps tab screens mounted), so useLiveSession's own
  // "check for a key" effect — which only runs once, on mount — never
  // gets a second chance to notice a key that got added *after* this
  // screen first mounted with none. Without this, a user who opens the
  // app before adding a key, then adds one in Settings and comes back,
  // sees "no key" forever even though one is now saved. `retry()`
  // already knows how to re-check from scratch when there's no key on
  // file yet — see useLiveSession.ts.
  const stateRef = useRef(state);
  stateRef.current = state;
  useFocusEffect(
    useCallback(() => {
      if (stateRef.current === 'no-key') retry();
    }, [retry]),
  );

  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  useEffect(() => {
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: true }),
    );
  }, [transcript]);

  const handleSend = () => {
    if (!draft.trim()) return;
    sendText(draft);
    setDraft('');
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
            if (state !== 'muted') toggleMic();
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
          <Icon name="menu" size={22} />
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
        <TouchableOpacity
          onPress={() =>
            // Cross-navigator jump (Home tab -> Settings tab -> a
            // specific screen in its stack) isn't something
            // @react-navigation's types model cleanly across sibling
            // navigators — `any` here is deliberate, not a shortcut
            // around a real type error.
            (navigation.getParent() as any)?.navigate('SettingsTab', {
              screen: 'Privacy',
            })
          }
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Privacy"
        >
          <Icon name="shield-outline" size={22} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.transcriptScroll}
        contentContainerStyle={styles.transcriptContent}
        keyboardShouldPersistTaps="handled"
      >
        {transcript.length === 0 ? (
          <View style={styles.emptyState}>
            {isOnboardingRef.current ? (
              <>
                <Text style={styles.emptyTitle}>Hi, I'm Donna.</Text>
                <Text style={styles.emptySubtitle}>
                  Nice to meet you — go ahead, say hello.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>Good morning.</Text>
                <Text style={styles.emptySubtitle}>
                  What can I help you with today?
                </Text>
              </>
            )}
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
          <PrimaryButton title="Try again" onPress={retry} />
        </View>
      ) : (
        <View style={styles.inputWrap}>
          <ChatInputBar
            value={draft}
            onChangeText={setDraft}
            onSend={handleSend}
            micActive={state === 'listening' || state === 'speaking'}
            onToggleMic={toggleMic}
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
