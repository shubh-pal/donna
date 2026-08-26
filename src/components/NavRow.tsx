import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing } from '../theme/colors';

type Props = {
  label: string;
  value?: React.ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  showChevron?: boolean;
};

/** A single tappable settings-list row: label on the left, a value/pill and chevron on the right. */
export default function NavRow({
  label,
  value,
  onPress,
  destructive,
  showChevron = true,
}: Props) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.6}
    >
      <Text style={[styles.label, destructive && styles.destructiveLabel]}>
        {label}
      </Text>
      <View style={styles.right}>
        {value}
        {onPress && showChevron ? (
          <Text style={styles.chevron}>›</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md - 2,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  destructiveLabel: {
    color: colors.danger,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chevron: {
    color: colors.textFaint,
    fontSize: 20,
    marginLeft: spacing.xs,
    marginTop: -2,
  },
});
