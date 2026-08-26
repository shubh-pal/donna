import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import ScreenContainer from '../components/ScreenContainer';
import PrimaryButton from '../components/PrimaryButton';
import FormError from '../components/FormError';
import TextField from '../components/TextField';
import SettingRow from '../components/SettingRow';
import { colors, radius, spacing } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { signOutUser } from '../config/authService';
import { firebaseAuthErrorMessage } from '../utils/validation';
import {
  clearGeminiApiKey,
  getGeminiApiKey,
  saveGeminiApiKey,
} from '../config/apiKeyStore';
import { validateGeminiApiKey } from '../config/geminiRest';
import {
  getSaveHistoryEnabled,
  setSaveHistoryEnabled,
} from '../config/preferences';
import {
  usePermissionStatuses,
  type DisplayStatus,
  type PermissionKey,
} from '../hooks/usePermissionStatuses';
import { useAmbientModeContext } from '../context/AmbientModeContext';
import type { AppStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Settings'>;

type KeyFieldStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  microphone: 'Microphone',
  bluetooth: 'Bluetooth',
  notifications: 'Notifications',
};

const STATUS_TEXT: Record<DisplayStatus, string> = {
  granted: 'Allowed',
  denied: 'Not allowed yet',
  blocked: 'Denied — open Settings to allow',
  limited: 'Limited',
  unsupported: 'Not available on this device',
  checking: 'Checking…',
};

const STATUS_COLOR: Record<DisplayStatus, string> = {
  granted: colors.success,
  denied: colors.textMuted,
  blocked: colors.danger,
  limited: colors.textMuted,
  unsupported: colors.textMuted,
  checking: colors.textMuted,
};

export default function SettingsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { enabled: ambientEnabled } = useAmbientModeContext();
  const [formError, setFormError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // --- Gemini API key -----------------------------------------------
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<KeyFieldStatus>({ kind: 'idle' });

  useEffect(() => {
    getGeminiApiKey().then(key => setHasSavedKey(Boolean(key)));
  }, []);

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) {
      setKeyStatus({ kind: 'error', message: 'Enter an API key first.' });
      return;
    }
    setKeyStatus({ kind: 'checking' });
    const result = await validateGeminiApiKey(apiKeyInput);
    if (!result.ok) {
      setKeyStatus({ kind: 'error', message: result.message });
      return;
    }
    await saveGeminiApiKey(apiKeyInput);
    setApiKeyInput('');
    setHasSavedKey(true);
    setKeyStatus({ kind: 'saved' });
  };

  const handleClearKey = async () => {
    await clearGeminiApiKey();
    setHasSavedKey(false);
    setApiKeyInput('');
    setKeyStatus({ kind: 'idle' });
  };

  // --- Conversation history toggle -----------------------------------
  const [saveHistory, setSaveHistory] = useState(false);

  useEffect(() => {
    getSaveHistoryEnabled().then(setSaveHistory);
  }, []);

  const handleToggleHistory = async (value: boolean) => {
    setSaveHistory(value);
    await setSaveHistoryEnabled(value);
  };

  // --- Permissions -----------------------------------------------
  const { statuses, requestPermission, openSettings } = usePermissionStatuses();

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

      <Text style={styles.sectionTitle}>Gemini API key</Text>
      <View style={styles.card}>
        <Text style={styles.cardBody}>
          Donna's conversation mode uses your own Gemini API key, called
          directly from this device to Google — never through our servers (we
          don't have any). Get a free key from{' '}
          <Text
            style={styles.link}
            onPress={() => Linking.openURL('https://aistudio.google.com')}
          >
            aistudio.google.com
          </Text>
          .
        </Text>

        {hasSavedKey ? (
          <>
            <View style={styles.savedKeyRow}>
              <Text style={styles.savedKeyText}>
                ● A key is saved on this device
              </Text>
            </View>
            <PrimaryButton
              title="Replace key"
              variant="secondary"
              onPress={() => setHasSavedKey(false)}
            />
            <PrimaryButton
              title="Remove key"
              variant="secondary"
              onPress={handleClearKey}
            />
          </>
        ) : (
          <>
            <TextField
              label="API key"
              placeholder="AIza…"
              value={apiKeyInput}
              onChangeText={text => {
                setApiKeyInput(text);
                if (keyStatus.kind !== 'idle') setKeyStatus({ kind: 'idle' });
              }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            {keyStatus.kind === 'error' ? (
              <FormError message={keyStatus.message} />
            ) : null}
            {keyStatus.kind === 'saved' ? (
              <Text style={styles.successText}>Key validated and saved.</Text>
            ) : null}
            <PrimaryButton
              title="Validate & save"
              onPress={handleSaveKey}
              loading={keyStatus.kind === 'checking'}
            />
          </>
        )}
      </View>

      <Text style={styles.sectionTitle}>Privacy</Text>
      <View style={styles.card}>
        <SettingRow
          label="Save conversation history"
          description="Off by default. When on, Donna keeps a local record of what you talk about."
        >
          <Switch value={saveHistory} onValueChange={handleToggleHistory} />
        </SettingRow>
        <Text style={styles.privacyNote}>
          Donna doesn't send anything anywhere until you add a Gemini API key
          above. Once you do, starting a conversation sends your microphone
          audio (and the transcript Google generates from it) directly to
          Google's Gemini API to get a response — governed by Google's own
          terms, not ours. This toggle only controls whether Donna additionally
          keeps a copy of that conversation on this device.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Ambient mode</Text>
      <View style={styles.card}>
        <Text style={styles.cardBody}>
          Always-on background listening, gated so Donna only ever speaks out
          loud through a connected Bluetooth device.
        </Text>
        <PrimaryButton
          title={
            ambientEnabled ? 'Ambient mode is on →' : 'Set up ambient mode →'
          }
          variant="secondary"
          onPress={() => navigation.navigate('AmbientMode')}
        />
      </View>

      <Text style={styles.sectionTitle}>Permissions</Text>
      <View style={styles.card}>
        {(Object.keys(PERMISSION_LABELS) as PermissionKey[]).map(key => (
          <SettingRow key={key} label={PERMISSION_LABELS[key]}>
            <View style={styles.permissionControl}>
              <Text
                style={[
                  styles.statusText,
                  { color: STATUS_COLOR[statuses[key]] },
                ]}
              >
                {STATUS_TEXT[statuses[key]]}
              </Text>
              {statuses[key] === 'blocked' ? (
                <Text style={styles.linkSmall} onPress={openSettings}>
                  Open Settings
                </Text>
              ) : statuses[key] === 'denied' ? (
                <Text
                  style={styles.linkSmall}
                  onPress={() => requestPermission(key)}
                >
                  Allow
                </Text>
              ) : null}
            </View>
          </SettingRow>
        ))}
        <Text style={styles.permissionsNote}>
          Conversation mode only needs the microphone. Bluetooth is what ambient
          mode checks before ever speaking out loud (see Ambient mode above);
          notifications back Android's required "Donna is listening"
          foreground-service notice.
        </Text>
      </View>
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
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
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
  cardBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  link: {
    color: colors.primary,
    fontWeight: '600',
  },
  linkSmall: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  savedKeyRow: {
    marginBottom: spacing.sm,
  },
  savedKeyText: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '600',
  },
  successText: {
    color: colors.success,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  privacyNote: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  permissionControl: {
    alignItems: 'flex-end',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  permissionsNote: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
});
