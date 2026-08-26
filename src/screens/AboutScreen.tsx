import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import BackButton from '../components/BackButton';
import NavRow from '../components/NavRow';
import Avatar from '../components/Avatar';
import { colors, radius, spacing } from '../theme/colors';
import packageJson from '../../package.json';
import type { SettingsStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<SettingsStackParamList, 'About'>;

const PRIVACY_POLICY =
  'Donna has no server of its own. Sign-in identity is handled by Firebase Authentication; conversation audio and text go directly from your device to Google’s Gemini API using your own API key. Nothing is sent to, or stored by, infrastructure Donna operates — because none exists. Conversation history, if you turn it on, is stored only in this app’s local storage on this device.';

const TERMS_OF_SERVICE =
  'Donna is provided as-is, without warranty of any kind. You are responsible for your own Firebase project and Gemini API key, and for complying with Google’s terms for both. Ambient mode’s background listening and Bluetooth-only speech gate are implemented to the specification in this app’s repository — verify their behavior on your own device before relying on them.';

export default function AboutScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <BackButton onPress={() => navigation.goBack()} />

        <View style={styles.hero}>
          <Avatar label="Donna" size={72} />
          <Text style={styles.wordmark}>Donna</Text>
          <Text style={styles.tagline}>AI Personal Assistant</Text>
          <Text style={styles.version}>Version {packageJson.version}</Text>
        </View>

        <View style={styles.card}>
          <NavRow
            label="Privacy Policy"
            onPress={() => Alert.alert('Privacy Policy', PRIVACY_POLICY)}
          />
          <View style={styles.divider} />
          <NavRow
            label="Terms of Service"
            onPress={() => Alert.alert('Terms of Service', TERMS_OF_SERVICE)}
          />
          <View style={styles.divider} />
          <NavRow
            label="Open Source Licenses"
            onPress={() =>
              Alert.alert(
                'Open Source Licenses',
                'Donna is built with React Native and the open-source packages listed in package.json, each under its own license.',
              )
            }
          />
        </View>

        <Text style={styles.footnote}>No backend. No servers.{'\n'}Your conversations stay on your device.</Text>
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
  hero: {
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  wordmark: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 2,
  },
  version: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSoft,
  },
  footnote: {
    color: colors.textFaint,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
