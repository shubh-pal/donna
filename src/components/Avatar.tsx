import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme/colors';

type Props = {
  label: string;
  size?: number;
};

/** A circular monogram avatar — used for both the user (Settings) and Donna's own mark (About). */
export default function Avatar({ label, size = 48 }: Props) {
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.letter, { fontSize: size * 0.44 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    color: colors.primaryDark,
    fontFamily: fonts.display,
    fontWeight: '600',
  },
});
