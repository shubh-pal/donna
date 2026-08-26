import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radius, spacing } from '../theme/colors';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  micActive: boolean;
  onToggleMic: () => void;
  micDisabled?: boolean;
};

/**
 * The always-visible message row at the bottom of the Conversation
 * screen. Typing and sending text and the continuous mic stream are two
 * ways into the same live session — this bar is just the entry point
 * for whichever one the user reaches for. The trailing icon is the mic
 * toggle when the field is empty, and becomes a send button the moment
 * there's text to send.
 */
export default function ChatInputBar({
  value,
  onChangeText,
  onSend,
  micActive,
  onToggleMic,
  micDisabled,
}: Props) {
  const hasText = value.trim().length > 0;

  return (
    <View style={styles.bar}>
      <TextInput
        style={styles.input}
        placeholder="Message Donna…"
        placeholderTextColor={colors.textFaint}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={hasText ? onSend : undefined}
        returnKeyType="send"
        multiline
      />
      <TouchableOpacity
        style={[
          styles.iconButton,
          hasText
            ? styles.iconButtonSend
            : micActive
              ? styles.iconButtonMicActive
              : styles.iconButtonMic,
        ]}
        onPress={hasText ? onSend : onToggleMic}
        disabled={!hasText && micDisabled}
        accessibilityRole="button"
        accessibilityLabel={
          hasText ? 'Send message' : micActive ? 'Mute microphone' : 'Unmute microphone'
        }
      >
        <Text style={styles.iconGlyph}>
          {hasText ? '➤' : micActive ? '🎙' : '🔇'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    maxHeight: 96,
    paddingVertical: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  iconButtonMic: {
    backgroundColor: colors.surfaceAlt,
  },
  iconButtonMicActive: {
    backgroundColor: colors.primarySoft,
  },
  iconButtonSend: {
    backgroundColor: colors.primary,
  },
  iconGlyph: {
    fontSize: 17,
  },
});
