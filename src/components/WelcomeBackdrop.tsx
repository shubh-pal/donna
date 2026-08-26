import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

/**
 * The soft blush/lavender wash behind the Welcome screen — a handful of
 * large, overlapping, semi-transparent circles rather than an SVG or
 * image asset, positioned absolutely behind the screen's content.
 */
export default function WelcomeBackdrop() {
  return (
    <View style={styles.container} pointerEvents="none">
      <View style={[styles.blob, styles.blobBlush]} />
      <View style={[styles.blob, styles.blobLavender]} />
      <View style={[styles.blob, styles.blobSmall]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  blob: {
    position: 'absolute',
    borderRadius: 9999,
  },
  blobBlush: {
    width: 420,
    height: 420,
    top: -140,
    right: -140,
    backgroundColor: colors.blushSoft,
  },
  blobLavender: {
    width: 380,
    height: 380,
    top: 60,
    left: -180,
    backgroundColor: colors.primarySoft,
  },
  blobSmall: {
    width: 220,
    height: 220,
    top: 260,
    right: -60,
    backgroundColor: colors.blushSoft,
    opacity: 0.7,
  },
});
