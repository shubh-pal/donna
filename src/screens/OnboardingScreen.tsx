import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ChatBubble from '../components/ChatBubble';
import ChatInputBar from '../components/ChatInputBar';
import TextField from '../components/TextField';
import PrimaryButton from '../components/PrimaryButton';
import FormError from '../components/FormError';
import { colors, fonts, spacing } from '../theme/colors';
import { getGeminiApiKey, saveGeminiApiKey } from '../config/apiKeyStore';
import { validateGeminiApiKey, extractMemoryFacts } from '../config/geminiRest';
import { buildOnboardingSetupMessage } from '../config/geminiLive';
import { addFacts, listFacts } from '../config/memoryStore';
import { useLiveSession, type LiveTranscriptEntry } from '../hooks/useLiveSession';
import { useAuth } from '../context/AuthContext';

type Step = 'checking' | 'api-key' | 'interview';

const STATUS_LABEL: Record<string, string> = {
  'checking-key': 'One sec…',
  'no-key': 'Set up your API key',
  connecting: 'Connecting…',
  listening: 'Listening',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  muted: 'Muted',
  error: 'Reconnecting…',
};

type KeyFieldStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'error'; message: string };

/**
 * The first-run "getting to know you" interview — a guided conversation
 * with Donna (reusing `useLiveSession`, the same mechanics as the real
 * Conversation screen) that seeds the memory store before the user ever
 * sees the main app. Requires an API key first, since the interview
 * itself is a live conversation; the key step is folded in here rather
 * than forcing a detour through Settings mid-onboarding.
 *
 * Finishing (naturally or via "I'm all set") calls
 * `markOnboardingComplete()`, which flips `RootNavigator` over to the
 * main tabs and unmounts this screen — `useLiveSession`'s own unmount
 * cleanup is what triggers the memory-extraction pass below, not an
 * explicit "end interview" step.
 */
export default function OnboardingScreen() {
  const { markOnboardingComplete } = useAuth();
  const [step, setStep] = useState<Step>('checking');

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [keyStatus, setKeyStatus] = useState<KeyFieldStatus>({ kind: 'idle' });

  useEffect(() => {
    getGeminiApiKey().then(key => setStep(key ? 'interview' : 'api-key'));
  }, []);

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) {
      setKeyStatus({ kind: 'error', message: 'Enter an API key first.' });
      return;
    }
    setKeyStatus({ kind: 'checking' });
    const result = await validateGeminiApiKey(apiKeyInput);
    if (!result.ok) {
      setKeyStatus({ kind: 'error', message: result.message });
      return;
    }
    await saveGeminiApiKey(apiKeyInput);
    setStep('interview');
  };

  const handleInterviewEnd = useCallback((transcript: LiveTranscriptEntry[]) => {
    if (transcript.length === 0) return;
    (async () => {
      const apiKey = await getGeminiApiKey();
      if (!apiKey) return;
      const existing = await listFacts();
      const newFacts = await extractMemoryFacts(
        apiKey,
        transcript.map(({ speaker, text }) => ({ speaker, text })),
        existing.map(f => f.text),
      );
      if (newFacts.length > 0) await addFacts(newFacts, 'onboarding');
    })();
  }, []);

  const buildSetup = useCallback(() => buildOnboardingSetupMessage(), []);
  const { state, transcript, sendText } = useLiveSession(
    buildSetup,
    handleInterviewEnd,
  );

  const [draft, setDraft] = useState('');
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

  if (step === 'checking') return null;

  if (step === 'api-key') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.apiKeyBody}>
          <Text style={styles.wordmark}>Donna</Text>
          <Text style={styles.title}>One quick thing first</Text>
          <Text style={styles.subtitle}>
            I'll need your own Gemini API key before we can talk — get a free
            one from aistudio.google.com, then paste it below.
          </Text>

          <TextField
            label="Gemini API key"
            placeholder="AIza…"
            value={apiKeyInput}
            onChangeText={text => {
              setApiKeyInput(text);
              if (keyStatus.kind !== 'idle') setKeyStatus({ kind: 'idle' });
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          {keyStatus.kind === 'error' ? (
            <FormError message={keyStatus.message} />
          ) : null}
          <PrimaryButton
            title="Validate & Continue"
            onPress={handleSaveKey}
            loading={keyStatus.kind === 'checking'}
          />
          <PrimaryButton
            title="Skip for now"
            variant="ghost"
            onPress={markOnboardingComplete}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Getting to know you</Text>
        <Text style={styles.headerStatus}>{STATUS_LABEL[state]}</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.transcriptScroll}
        contentContainerStyle={styles.transcriptContent}
        keyboardShouldPersistTaps="handled"
      >
        {transcript.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Hi, I'm Donna.</Text>
            <Text style={styles.emptySubtitle}>
              Mind if I ask a few questions so I actually know who I'm
              working with?
            </Text>
          </View>
        ) : (
          transcript.map(entry => (
            <ChatBubble key={entry.id} speaker={entry.speaker} text={entry.text} />
          ))
        )}
      </ScrollView>

      <View style={styles.inputWrap}>
        <ChatInputBar
          value={draft}
          onChangeText={setDraft}
          onSend={handleSend}
          micActive={state === 'listening' || state === 'speaking'}
          onToggleMic={() => {}}
          micDisabled
        />
        <PrimaryButton
          title="I'm all set"
          variant="ghost"
          onPress={markOnboardingComplete}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  apiKeyBody: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  wordmark: {
    fontFamily: fonts.display,
    fontStyle: 'italic',
    fontSize: 32,
    color: colors.primaryDark,
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
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
    lineHeight: 21,
  },
  inputWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
  },
});
