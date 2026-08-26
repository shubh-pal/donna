import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';

export type PillTone = 'success' | 'neutral' | 'muted' | 'danger';

type Props = {
  label: string;
  tone?: PillTone;
};

const TONE_COLOR: Record<PillTone, string> = {
  success: colors.success,
  neutral: colors.primaryDark,
  muted: colors.textMuted,
  danger: colors.danger,
};

const TONE_BG: Record<PillTone, string> = {
  success: colors.successSoft,
  neutral: colors.primarySoft,
  muted: colors.surfaceAlt,
  danger: colors.dangerSoft,
};

/** A small status chip — "Configured", "Connected", "On" — used across Settings/Ambient/History. */
export default function StatusPill({ label, tone = 'neutral' }: Props) {
  return (
    <View style={[styles.pill, { backgroundColor: TONE_BG[tone] }]}>
      <View style={[styles.dot, { backgroundColor: TONE_COLOR[tone] }]} />
      <Text style={[styles.label, { color: TONE_COLOR[tone] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
