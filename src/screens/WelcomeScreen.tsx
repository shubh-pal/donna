import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import PrimaryButton from '../components/PrimaryButton';
import WelcomeBackdrop from '../components/WelcomeBackdrop';
import { colors, fonts, spacing } from '../theme/colors';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

/** The very first screen — sets the tone (wordmark, tagline) before asking for anything. */
export default function WelcomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <WelcomeBackdrop />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.body}>
          <Text style={styles.wordmark}>Donna</Text>
          <Text style={styles.tagline}>AI Personal Assistant</Text>
          <Text style={styles.blurb}>
            Sharp. Unflappable.{'\n'}Always three moves ahead.
          </Text>
        </View>

        <View style={styles.footer}>
          <PrimaryButton
            title="Get Started"
            onPress={() => navigation.navigate('Signup')}
          />
          <Text
            style={styles.learnMore}
            onPress={() => navigation.navigate('Login')}
          >
            Already have an account? Log in
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: 52,
    fontStyle: 'italic',
    color: colors.primaryDark,
  },
  tagline: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  blurb: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.lg,
  },
  footer: {
    paddingBottom: spacing.lg,
  },
  learnMore: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
