import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme/colors';
import { useAmbientModeContext } from '../context/AmbientModeContext';
import type { AmbientPhase } from '../hooks/useAmbientMode';

const PHASE_LABEL: Partial<Record<AmbientPhase, string>> = {
  starting: 'Starting ambient mode…',
  listening: "Ambient mode — I'm listening.",
  speaking: 'Ambient mode — Donna is speaking…',
};

/**
 * The persistent visual "listening" indicator the brief asks for —
 * mounted once above the app's screen stack (`RootNavigator.tsx`), not
 * per-screen, so it stays visible (and its kill switch stays reachable)
 * no matter which screen is on top. Renders nothing when ambient mode is
 * off; see `useAmbientMode.ts` for the haptic half of the indicator,
 * pulsed on the same phase transitions this banner animates.
 */
export default function AmbientListeningBanner() {
  const { phase, errorMessage, bluetoothConnected, disable } =
    useAmbientModeContext();
  const pulse = useRef(new Animated.Value(1)).current;

  const visible =
    phase === 'starting' ||
    phase === 'listening' ||
    phase === 'speaking' ||
    phase === 'error';

  useEffect(() => {
    if (phase !== 'listening' && phase !== 'speaking') {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

  if (!visible) return null;

  const isError = phase === 'error';

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeArea, isError && styles.bannerError]}
    >
      <View style={[styles.banner, isError && styles.bannerError]}>
        <Animated.View
          style={[styles.dot, isError && styles.dotError, { opacity: pulse }]}
        />
        <View style={styles.textColumn}>
          <Text style={styles.label} numberOfLines={1}>
            {isError
              ? errorMessage ?? 'Ambient mode stopped.'
              : PHASE_LABEL[phase]}
          </Text>
          {!isError && phase !== 'starting' ? (
            <Text style={styles.sublabel} numberOfLines={1}>
              {bluetoothConnected
                ? 'Bluetooth connected — I can reply out loud.'
                : "No Bluetooth — I'm listening silently."}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={disable}
          style={styles.stopButton}
          accessibilityRole="button"
          accessibilityLabel="Stop ambient mode"
        >
          <Text style={styles.stopText}>Stop</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.surfaceAlt,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bannerError: {
    backgroundColor: '#3A1620',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
    marginRight: spacing.sm,
  },
  dotError: {
    backgroundColor: colors.danger,
  },
  textColumn: {
    flex: 1,
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  sublabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  stopButton: {
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    marginLeft: spacing.sm,
  },
  stopText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
});
