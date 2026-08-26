import React from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { colors, radius, spacing } from '../theme/colors';

type Props = {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: React.ReactNode;
};

export default function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  icon,
}: Props) {
  const isSecondary = variant === 'secondary';
  const isGhost = variant === 'ghost';
  return (
    <TouchableOpacity
      style={[
        styles.button,
        isSecondary && styles.secondary,
        isGhost && styles.ghost,
        (disabled || loading) && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.82}
    >
      {loading ? (
        <ActivityIndicator
          color={isSecondary || isGhost ? colors.primary : colors.white}
        />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.text,
              (isSecondary || isGhost) && styles.secondaryText,
              icon ? styles.textWithIcon : null,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    paddingVertical: spacing.md - 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.45,
  },
  text: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  textWithIcon: {
    marginLeft: spacing.sm,
  },
  secondaryText: {
    color: colors.text,
  },
});
