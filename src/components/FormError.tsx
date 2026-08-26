import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';

type Props = {
  message?: string | null;
};

/**
 * Banner for form-level (non-field-specific) errors, e.g. a rejected
 * Firebase auth request.
 */
export default function FormError({ message }: Props) {
  if (!message) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 92, 122, 0.12)',
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginBottom: spacing.md,
  },
  text: {
    color: colors.danger,
    fontSize: 14,
  },
});
