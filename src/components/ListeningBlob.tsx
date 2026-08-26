import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

type Props = {
  active: boolean;
  size?: number;
};

/**
 * The soft pulsing "listening" blob on the focus screen — three
 * concentric, semi-transparent circles that breathe in and out on a
 * loop while `active`. No image/SVG dependency: just layered Animated
 * Views, which keeps this cheap and theme-token-driven.
 */
export default function ListeningBlob({ active, size = 220 }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const outerScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.18],
  });
  const midScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.1],
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.ring,
          styles.ringOuter,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ scale: outerScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          styles.ringMid,
          {
            width: size * 0.72,
            height: size * 0.72,
            borderRadius: (size * 0.72) / 2,
            transform: [{ scale: midScale }],
          },
        ]}
      />
      <View
        style={[
          styles.core,
          {
            width: size * 0.42,
            height: size * 0.42,
            borderRadius: (size * 0.42) / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
  },
  ringOuter: {
    backgroundColor: colors.blushSoft,
  },
  ringMid: {
    backgroundColor: colors.primarySoft,
  },
  core: {
    backgroundColor: colors.primary,
    opacity: 0.85,
  },
});
