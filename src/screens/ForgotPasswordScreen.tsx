import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ScreenContainer from '../components/ScreenContainer';
import TextField from '../components/TextField';
import PrimaryButton from '../components/PrimaryButton';
import FormError from '../components/FormError';
import { colors, spacing } from '../theme/colors';
import { validateEmail, firebaseAuthErrorMessage } from '../utils/validation';
import { sendPasswordReset } from '../config/authService';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    const validationError = validateEmail(email);
    setEmailError(validationError);
    setFormError(null);
    if (validationError) return;

    setSubmitting(true);
    try {
      await sendPasswordReset(email.trim());
      setSent(true);
    } catch (error) {
      setFormError(firebaseAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.brand}>Donna</Text>
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.subtitle}>
          Enter your account email and we'll send you a reset link.
        </Text>
      </View>

      <FormError message={formError} />

      {sent ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>
            If an account exists for {email.trim()}, a reset link is on its way.
          </Text>
        </View>
      ) : (
        <>
          <TextField
            label="Email"
            placeholder="you@example.com"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            error={emailError}
          />
          <PrimaryButton
            title="Send reset link"
            onPress={handleSubmit}
            loading={submitting}
          />
        </>
      )}

      <View style={styles.footer}>
        <Text style={styles.link} onPress={() => navigation.navigate('Login')}>
          Back to login
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.lg,
  },
  brand: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: spacing.xs,
  },
  successBox: {
    backgroundColor: 'rgba(61, 214, 140, 0.12)',
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  successText: {
    color: colors.success,
    fontSize: 14,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  link: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
