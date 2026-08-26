import { Platform } from 'react-native';

/**
 * Donna's design system, v2 (Phase 4) — a warm, light "personal
 * assistant" palette (cream paper, soft lavender/blush accents)
 * replacing the Phase 1 dark scaffold. Every screen reads its colors
 * from here rather than hard-coding hex values, so the palette can be
 * retuned in one place.
 */
export const colors = {
  background: '#FBF7F2',
  surface: '#FFFFFF',
  surfaceAlt: '#F3ECE3',
  border: '#EAE1D5',
  borderSoft: '#F0E9DF',

  primary: '#9C84C2',
  primaryDark: '#7C63A8',
  primarySoft: '#EFE7F7',
  blush: '#F5D2CE',
  blushSoft: '#FBEAE7',

  text: '#2B2730',
  textMuted: '#8B8590',
  textFaint: '#B6AFB8',

  danger: '#C6564A',
  dangerSoft: '#F7E2DF',
  success: '#4EA97E',
  successSoft: '#E4F3EB',

  white: '#FFFFFF',
  black: '#000000',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

/**
 * Georgia (iOS) / the platform "serif" alias (Android, which resolves
 * to Noto Serif) stand in for the mockup's elegant display serif —
 * both ship with the OS, so the wordmark and headline moments get a
 * serif "signature" feel without bundling a custom font file.
 */
export const fonts = {
  display: Platform.select({ ios: 'Georgia', default: 'serif' }),
};

/** Shared card shadow — soft and low, consistent with the paper/cream palette. */
export const cardShadow = {
  shadowColor: '#4A3F55',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};
