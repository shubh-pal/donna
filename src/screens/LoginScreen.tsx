import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ScreenContainer from '../components/ScreenContainer';
import TextField from '../components/TextField';
import PrimaryButton from '../components/PrimaryButton';
import FormError from '../components/FormError';
import { colors, spacing } from '../theme/colors';
import {
  validateEmail,
  validatePassword,
  firebaseAuthErrorMessage,
} from '../utils/validation';
import { signInWithEmail, signInWithGoogle } from '../config/authService';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const handleSubmit = async () => {
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    setFieldErrors({ email: emailError, password: passwordError });
    setFormError(null);
    if (emailError || passwordError) return;

    setSubmitting(true);
    try {
      await signInWithEmail(email.trim(), password);
      // Navigation to Home happens automatically via the auth state
      // listener in RootNavigator once Firebase confirms the session.
    } catch (error) {
      setFormError(firebaseAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setFormError(null);
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      setFormError(firebaseAuthErrorMessage(error));
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.brand}>Donna</Text>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>
          Sign in to pick up where you left off.
        </Text>
      </View>

      <FormError message={formError} />

      <TextField
        label="Email"
        placeholder="you@example.com"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        error={fieldErrors.email}
      />
      <TextField
        label="Password"
        placeholder="••••••••"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        error={fieldErrors.password}
      />

      <View style={styles.forgotRow}>
        <Text
          style={styles.link}
          onPress={() => navigation.navigate('ForgotPassword')}
        >
          Forgot password?
        </Text>
      </View>

      <PrimaryButton
        title="Log in"
        onPress={handleSubmit}
        loading={submitting}
      />
      <PrimaryButton
        title="Continue with Google"
        onPress={handleGoogleSignIn}
        loading={googleSubmitting}
        variant="secondary"
      />

      <View style={styles.footer}>
        <Text style={styles.footerText}>Don't have an account? </Text>
        <Text style={styles.link} onPress={() => navigation.navigate('Signup')}>
          Sign up
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
  forgotRow: {
    alignItems: 'flex-end',
    marginBottom: spacing.md,
  },
  link: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
