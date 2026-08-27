import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import BackButton from '../components/BackButton';
import SettingRow from '../components/SettingRow';
import { colors, radius, spacing } from '../theme/colors';
import {
  getSaveHistoryEnabled,
  setSaveHistoryEnabled,
} from '../config/preferences';
import { clearAllSessions } from '../config/historyStore';
import type { SettingsStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Privacy'>;

export default function PrivacyScreen({ navigation }: Props) {
  const [saveHistory, setSaveHistory] = useState(false);

  useEffect(() => {
    getSaveHistoryEnabled().then(setSaveHistory);
  }, []);

  const handleToggleHistory = async (value: boolean) => {
    setSaveHistory(value);
    await setSaveHistoryEnabled(value);
    if (!value) {
      // Turning history off also clears what's already stored — "off"
      // should mean off, not "stop adding to it."
      await clearAllSessions();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Privacy</Text>

        <View style={styles.card}>
          <SettingRow
            label="Save conversation history"
            description="On by default. Donna keeps a local record of what you talk about, viewable in the History tab — turn this off anytime, which also clears what's already saved."
          >
            <Switch value={saveHistory} onValueChange={handleToggleHistory} />
          </SettingRow>
        </View>

        <View style={styles.card}>
          <Text style={styles.body}>
            Donna doesn't send anything anywhere until you add a Gemini API
            key in Settings. Once you do, starting a conversation sends your
            microphone audio (and the transcript Google generates from it)
            directly to Google's Gemini API to get a response — governed by
            Google's own terms, not ours.
          </Text>
          <Text style={styles.body}>
            The toggle above only controls whether Donna additionally keeps a
            copy of that conversation on this device. There is no Donna
            server of any kind — history lives only in this app's local
            storage, and clearing it (or turning the toggle off) removes it
            for good.
          </Text>
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
  body: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.sm,
  },
});
