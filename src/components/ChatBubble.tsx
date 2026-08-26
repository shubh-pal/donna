import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';

type Props = {
  speaker: 'you' | 'donna';
  text: string;
};

/** One message bubble in the Conversation transcript — Donna's on the left, the user's on the right. */
export default function ChatBubble({ speaker, text }: Props) {
  const isDonna = speaker === 'donna';
  return (
    <View
      style={[styles.row, isDonna ? styles.rowDonna : styles.rowYou]}
    >
      {isDonna ? (
        <Text style={styles.speakerLabel}>Donna</Text>
      ) : null}
      <View
        style={[styles.bubble, isDonna ? styles.bubbleDonna : styles.bubbleYou]}
      >
        <Text style={[styles.text, isDonna ? styles.textDonna : styles.textYou]}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: spacing.md,
    maxWidth: '82%',
  },
  rowDonna: {
    alignSelf: 'flex-start',
  },
  rowYou: {
    alignSelf: 'flex-end',
  },
  speakerLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    marginLeft: spacing.sm,
  },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  bubbleDonna: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderBottomLeftRadius: radius.sm,
  },
  bubbleYou: {
    backgroundColor: colors.primarySoft,
    borderBottomRightRadius: radius.sm,
  },
  text: {
    fontSize: 15,
    lineHeight: 21,
  },
  textDonna: {
    color: colors.text,
  },
  textYou: {
    color: colors.primaryDark,
  },
});
