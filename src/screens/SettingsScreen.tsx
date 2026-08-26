import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import PrimaryButton from '../components/PrimaryButton';
import FormError from '../components/FormError';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { signOutUser } from '../config/authService';
import { firebaseAuthErrorMessage } from '../utils/validation';

export default function SettingsScreen() {
  const { user } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setFormError(null);
    setSigningOut(true);
    try {
      await signOutUser();
      // RootNavigator switches back to the auth stack automatically.
    } catch (error) {
      setFormError(firebaseAuthErrorMessage(error));
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <ScreenContainer>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{user?.email ?? 'Unknown'}</Text>
      </View>

      <FormError message={formError} />

      <PrimaryButton
        title="Log out"
        onPress={handleSignOut}
        loading={signingOut}
        variant="secondary"
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
