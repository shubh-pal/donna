import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';

type Props = {
  onPress: () => void;
};

export default function BackButton({ onPress }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={styles.glyph}>‹</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  glyph: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 22,
    marginTop: -2,
  },
});
