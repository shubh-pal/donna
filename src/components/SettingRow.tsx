import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme/colors';

type Props = {
  label: string;
  description?: string;
  children: React.ReactNode;
};

/**
 * A label (+ optional description) on the left, an arbitrary control
 * (switch, status pill, button) on the right. Shared layout for the
 * Settings screen's permission and preference rows.
 */
export default function SettingRow({ label, description, children }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.textColumn}>
        <Text style={styles.label}>{label}</Text>
        {description ? (
          <Text style={styles.description}>{description}</Text>
        ) : null}
      </View>
      <View style={styles.control}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 4,
  },
  textColumn: {
    flex: 1,
    paddingRight: spacing.md,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  description: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  control: {
    alignItems: 'flex-end',
  },
});
