import React from 'react';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { colors } from '../theme/colors';

type Props = {
  /** Any MaterialCommunityIcons glyph name — see https://pictogrammers.com/library/mdi/ */
  name: string;
  size?: number;
  color?: string;
};

/**
 * A thin, project-wide wrapper around react-native-vector-icons'
 * MaterialCommunityIcons font — the single icon set used everywhere in
 * the app, replacing the emoji/text glyphs (🎙, 🔇, ☰, 🛡, ⌂, ◷, ⚙, ‹,
 * ›) earlier screens used as placeholders. Centralizing the default
 * size/color here means every call site doesn't have to repeat them.
 */
export default function Icon({ name, size = 22, color = colors.text }: Props) {
  return <MaterialCommunityIcon name={name} size={size} color={color} />;
}
