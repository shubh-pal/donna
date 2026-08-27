import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import BackButton from '../components/BackButton';
import ChatBubble from '../components/ChatBubble';
import PrimaryButton from '../components/PrimaryButton';
import { listSessions, type HistorySession } from '../config/historyStore';
import { colors, spacing } from '../theme/colors';
import type { HistoryStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<HistoryStackParamList, 'HistoryDetail'>;

/**
 * Viewer for one saved conversation — reuses ChatBubble so it looks
 * identical to the live screen. "Continue This Conversation" hands the
 * session id to the Home tab (cross-tab navigation — `navigation`
 * here is scoped to the History stack, so this goes through
 * `getParent()` to reach the Tab navigator, same pattern
 * ConversationScreen uses for its own cross-tab jumps), where
 * ConversationScreen resolves it back into this session's messages and
 * resumes from there — see that screen and useLiveSession's
 * `initialTranscript`.
 */
export default function HistoryDetailScreen({ navigation, route }: Props) {
  const [session, setSession] = useState<HistorySession | null | undefined>(
    undefined,
  );

  useEffect(() => {
    listSessions().then(sessions => {
      setSession(sessions.find(s => s.id === route.params.sessionId) ?? null);
    });
  }, [route.params.sessionId]);

  const handleContinue = () => {
    if (!session) return;
    (navigation.getParent() as any)?.navigate('HomeTab', {
      screen: 'Conversation',
      params: { continueSessionId: session.id },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title} numberOfLines={1}>
          {session?.title ?? 'Conversation'}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {session === null ? (
          <Text style={styles.missing}>
            This conversation is no longer on this device.
          </Text>
        ) : (
          session?.messages.map((message, index) => (
            <ChatBubble
              key={index}
              speaker={message.speaker}
              text={message.text}
            />
          ))
        )}
      </ScrollView>
      {session ? (
        <View style={styles.footer}>
          <PrimaryButton
            title="Continue This Conversation"
            onPress={handleContinue}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  content: {
    padding: spacing.lg,
  },
  missing: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
