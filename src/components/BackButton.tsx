import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import Icon from './Icon';
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
      <Icon name="chevron-left" size={24} color={colors.text} />
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
});
