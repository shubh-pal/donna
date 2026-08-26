import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import BackButton from '../components/BackButton';
import TextField from '../components/TextField';
import PrimaryButton from '../components/PrimaryButton';
import FormError from '../components/FormError';
import StatusPill from '../components/StatusPill';
import { colors, radius, spacing } from '../theme/colors';
import {
  clearGeminiApiKey,
  getGeminiApiKey,
  saveGeminiApiKey,
} from '../config/apiKeyStore';
import { validateGeminiApiKey } from '../config/geminiRest';
import type { SettingsStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<SettingsStackParamList, 'APIKey'>;

type KeyFieldStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

export default function APIKeyScreen({ navigation }: Props) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<KeyFieldStatus>({ kind: 'idle' });

  useEffect(() => {
    getGeminiApiKey().then(key => setHasSavedKey(Boolean(key)));
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
    setApiKeyInput('');
    setHasSavedKey(true);
    setKeyStatus({ kind: 'saved' });
  };

  const handleClearKey = async () => {
    await clearGeminiApiKey();
    setHasSavedKey(false);
    setApiKeyInput('');
    setKeyStatus({ kind: 'idle' });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Gemini API Key</Text>
        <Text style={styles.intro}>
          Conversation mode uses your own Gemini API key, called directly
          from this device to Google — never through our servers (we don't
          have any). Get a free key from{' '}
          <Text
            style={styles.link}
            onPress={() => Linking.openURL('https://aistudio.google.com')}
          >
            aistudio.google.com
          </Text>
          .
        </Text>

        <View style={styles.card}>
          {hasSavedKey ? (
            <>
              <StatusPill label="Configured" tone="success" />
              <PrimaryButton
                title="Replace key"
                variant="secondary"
                onPress={() => setHasSavedKey(false)}
              />
              <PrimaryButton
                title="Remove key"
                variant="ghost"
                onPress={handleClearKey}
              />
            </>
          ) : (
            <>
              <TextField
                label="API key"
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
              {keyStatus.kind === 'saved' ? (
                <Text style={styles.successText}>Key validated and saved.</Text>
              ) : null}
              <PrimaryButton
                title="Validate & Save"
                onPress={handleSaveKey}
                loading={keyStatus.kind === 'checking'}
              />
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  intro: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  link: {
    color: colors.primaryDark,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  successText: {
    color: colors.success,
    fontSize: 13,
  },
});
