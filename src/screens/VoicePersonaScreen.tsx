import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import BackButton from '../components/BackButton';
import StatusPill from '../components/StatusPill';
import { DONNA_SYSTEM_PROMPT } from '../config/geminiLive';
import { colors, radius, spacing } from '../theme/colors';
import type { SettingsStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<SettingsStackParamList, 'VoicePersona'>;

/**
 * Read-only for now — Donna has one persona and one voice (whatever
 * Gemini Live's default AUDIO response voice is). This screen exists so
 * "Voice & Persona" in Settings goes somewhere real and explains what's
 * actually configurable today, rather than a dead-end row.
 */
export default function VoicePersonaScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Voice & Persona</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Persona</Text>
            <StatusPill label="Donna (Default)" tone="neutral" />
          </View>
          <Text style={styles.body}>{DONNA_SYSTEM_PROMPT}</Text>
        </View>

        <Text style={styles.footnote}>
          Donna currently has one persona and speaks with the Gemini Live
          API's default response voice — there isn't a picker yet. This
          screen is here so the option is discoverable, and to be honest
          about what's configurable today versus planned.
        </Text>
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
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  body: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  footnote: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 18,
  },
});
