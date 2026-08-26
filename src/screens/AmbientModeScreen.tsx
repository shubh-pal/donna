import React from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import SettingRow from '../components/SettingRow';
import { colors, radius, spacing } from '../theme/colors';
import { useAmbientModeContext } from '../context/AmbientModeContext';
import type { AmbientPhase } from '../hooks/useAmbientMode';

const PHASE_TEXT: Record<AmbientPhase, string> = {
  idle: 'Off.',
  starting: 'Starting…',
  listening: "Listening — I'll only speak up if it's worth it.",
  speaking: 'Speaking…',
  error: 'Stopped because of an error — see below.',
};

const CONFIRMATION_MESSAGE =
  "Donna will keep listening in the background — even with the screen off or the app backgrounded — and send what she hears to Google's Gemini API, the same as Conversation mode. She will only ever speak her replies out loud through a connected Bluetooth device, never through the phone's speaker, and stays silent unless she has something genuinely worth saying. Turn this off anytime with the Stop button or this switch.";

/**
 * Ambient mode's settings/detail screen: the toggle, the required
 * one-time confirmation dialog, live status, and an explanation of what
 * it actually does. The persistent listening indicator + kill switch
 * live in `AmbientListeningBanner.tsx` (mounted globally, not here) so
 * they stay visible after navigating away from this screen — this screen
 * itself just also surfaces a Stop control via the switch for
 * discoverability.
 */
export default function AmbientModeScreen() {
  const {
    ready,
    phase,
    enabled,
    confirmed,
    bluetoothConnected,
    errorMessage,
    nativeAvailable,
    enable,
    disable,
    confirmAmbientMode,
  } = useAmbientModeContext();

  const handleToggle = (value: boolean) => {
    if (!value) {
      disable();
      return;
    }
    if (confirmed) {
      enable();
      return;
    }
    Alert.alert('Turn on ambient mode?', CONFIRMATION_MESSAGE, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Turn on',
        onPress: async () => {
          await confirmAmbientMode();
          await enable();
        },
      },
    ]);
  };

  return (
    <ScreenContainer>
      <Text style={styles.title}>Ambient mode</Text>
      <Text style={styles.intro}>
        Donna listens in the background and only speaks up when she has
        something worth saying — and only out loud through a connected Bluetooth
        device.
      </Text>

      <View style={styles.card}>
        <SettingRow label="Ambient mode" description={PHASE_TEXT[phase]}>
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            disabled={!ready}
          />
        </SettingRow>
      </View>

      {!nativeAvailable ? (
        <View style={styles.card}>
          <Text style={styles.warningText}>
            This build doesn't have the ambient audio native module linked, so
            ambient mode can't actually run here — see NOTES.md "Phase 3" for
            what a real device build needs.
          </Text>
        </View>
      ) : null}

      {phase === 'error' && errorMessage ? (
        <View style={styles.card}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {enabled && phase !== 'error' ? (
        <View style={styles.card}>
          <Text style={styles.statusLine}>
            {bluetoothConnected
              ? '🔊 Bluetooth connected — Donna can reply out loud.'
              : "🔇 No Bluetooth connected — Donna is listening silently and won't speak."}
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>How this works</Text>
        <Text style={styles.bodyText}>
          • Turning this on starts a real background microphone capture — a
          persistent notification on Android; best-effort while backgrounded on
          iOS (see NOTES.md).{'\n\n'}• Audio streams to Gemini Live with a
          persona instructed to stay quiet unless she has something genuinely
          witty or useful to add.{'\n\n'}• Even when she does have something to
          say, she's only allowed to speak it through a connected Bluetooth
          output — never the phone's own speaker or earpiece.{'\n\n'}• The
          banner at the top of the app while this is on is your listening
          indicator; its Stop button (or this switch) is the kill switch — it
          works immediately, from anywhere in the app.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  intro: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  warningText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
  statusLine: {
    color: colors.text,
    fontSize: 14,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  bodyText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
});
