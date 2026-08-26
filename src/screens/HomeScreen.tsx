import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ScreenContainer from '../components/ScreenContainer';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import type { AppStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const { user } = useAuth();
  const displayName =
    user?.displayName || user?.email?.split('@')[0] || 'there';

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hi {displayName},</Text>
        <Text style={styles.title}>I'm Donna.</Text>
        <Text style={styles.subtitle}>
          Hold the button on the Conversation screen and talk to me — add a
          Gemini API key in Settings first if you haven't.
        </Text>
      </View>

      <PrimaryButton
        title="Talk to Donna"
        onPress={() => navigation.navigate('Conversation')}
      />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What's ready now</Text>
        <Text style={styles.cardItem}>• Account &amp; sign-in</Text>
        <Text style={styles.cardItem}>• Live voice conversation mode</Text>
        <Text style={styles.cardItem}>
          • Ambient background listening, Bluetooth-gated
        </Text>
        <Text style={styles.cardItem}>
          • Your own Gemini API key, stored on-device
        </Text>
      </View>

      <PrimaryButton
        title="Set up ambient mode"
        variant="secondary"
        onPress={() => navigation.navigate('AmbientMode')}
      />

      <Text
        style={styles.settingsLink}
        onPress={() => navigation.navigate('Settings')}
      >
        Go to Settings →
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.lg,
  },
  greeting: {
    color: colors.textMuted,
    fontSize: 16,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  cardItem: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.xs,
  },
  settingsLink: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
});
