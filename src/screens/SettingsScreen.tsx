import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Avatar from '../components/Avatar';
import NavRow from '../components/NavRow';
import StatusPill from '../components/StatusPill';
import PrimaryButton from '../components/PrimaryButton';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { signOutUser } from '../config/authService';
import { getGeminiApiKey } from '../config/apiKeyStore';
import { listFacts } from '../config/memoryStore';
import { useAmbientModeContext } from '../context/AmbientModeContext';
import { usePermissionStatuses } from '../hooks/usePermissionStatuses';
import type { SettingsStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<SettingsStackParamList, 'SettingsHome'>;

export default function SettingsScreen({ navigation }: Props) {
  const { user, resetOnboarding } = useAuth();
  const { enabled: ambientEnabled } = useAmbientModeContext();
  const { statuses, openSettings } = usePermissionStatuses();
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [memoryCount, setMemoryCount] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getGeminiApiKey().then(key => setHasApiKey(Boolean(key)));
      listFacts().then(facts => setMemoryCount(facts.length));
    }, []),
  );

  const displayName =
    user?.displayName || user?.email?.split('@')[0] || 'Donna Fan';

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOutUser();
      // RootNavigator switches back to the auth stack automatically.
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.profileRow}>
          <Avatar label={displayName} size={52} />
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileEmail}>{user?.email ?? ''}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Donna</Text>
        <View style={styles.card}>
          <NavRow
            label="API Key"
            value={
              <StatusPill
                label={hasApiKey ? 'Configured' : 'Not set'}
                tone={hasApiKey ? 'success' : 'muted'}
              />
            }
            onPress={() => navigation.navigate('APIKey')}
          />
          <View style={styles.divider} />
          <NavRow
            label="Ambient Mode"
            value={
              <StatusPill
                label={ambientEnabled ? 'On' : 'Off'}
                tone={ambientEnabled ? 'success' : 'muted'}
              />
            }
            onPress={() => navigation.navigate('AmbientMode')}
          />
          <View style={styles.divider} />
          <NavRow
            label="Voice & Persona"
            value={<Text style={styles.valueText}>Donna (Default)</Text>}
            onPress={() => navigation.navigate('VoicePersona')}
          />
          <View style={styles.divider} />
          <NavRow
            label="Memory"
            value={
              <StatusPill
                label={memoryCount > 0 ? `${memoryCount} facts` : 'Empty'}
                tone={memoryCount > 0 ? 'success' : 'muted'}
              />
            }
            onPress={() => navigation.navigate('Memory')}
          />
          <View style={styles.divider} />
          <NavRow
            label="Notifications"
            value={
              <StatusPill
                label={statuses.notifications === 'granted' ? 'On' : 'Off'}
                tone={statuses.notifications === 'granted' ? 'success' : 'muted'}
              />
            }
            onPress={openSettings}
          />
        </View>

        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.card}>
          <NavRow label="Privacy" onPress={() => navigation.navigate('Privacy')} />
          <View style={styles.divider} />
          <NavRow label="About Donna" onPress={() => navigation.navigate('About')} />
          <View style={styles.divider} />
          <NavRow
            label="Redo Getting-to-Know-You Interview"
            onPress={resetOnboarding}
            showChevron={false}
          />
        </View>

        <PrimaryButton
          title="Log Out"
          onPress={handleSignOut}
          loading={signingOut}
          variant="secondary"
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  profileText: {
    marginLeft: spacing.md,
  },
  profileName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  profileEmail: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 1,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.borderSoft,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSoft,
  },
  valueText: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
