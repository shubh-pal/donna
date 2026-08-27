import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from '../components/Icon';
import {
  clearAllSessions,
  searchSessions,
  type HistorySession,
} from '../config/historyStore';
import { colors, fonts, radius, spacing } from '../theme/colors';
import type { HistoryStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<HistoryStackParamList, 'History'>;

function formatTimestamp(ms: number): string {
  const date = new Date(ms);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (isToday) return `Today, ${time}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export default function HistoryScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback((q: string) => {
    searchSessions(q).then(result => {
      setSessions(result);
      setLoaded(true);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload(query);
      // Re-run only on focus/query change, not on every `reload` identity
      // change — `reload` is stable (empty deps) so this is safe.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]),
  );

  const handleClear = () => {
    Alert.alert(
      'Clear all history?',
      'This removes every saved conversation from this device. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearAllSessions();
            reload(query);
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <Text style={styles.title}>History</Text>

      <TextInput
        style={styles.search}
        placeholder="Search conversations"
        placeholderTextColor={colors.textFaint}
        value={query}
        onChangeText={text => {
          setQuery(text);
          reload(text);
        }}
      />

      {loaded && sessions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>
            {query ? 'No matching conversations' : 'Nothing here yet'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {query
              ? 'Try a different search term.'
              : 'Conversations only appear here once you turn on "Save conversation history" in Settings.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                // Jump straight into a live, continuable conversation
                // instead of the read-only detail view + a separate
                // "Continue" tap — see ConversationScreen.tsx and
                // useLiveSession's `initialTranscript`.
                (navigation.getParent() as any)?.navigate('HomeTab', {
                  screen: 'Conversation',
                  params: { continueSessionId: item.id },
                })
              }
              onLongPress={() =>
                navigation.navigate('HistoryDetail', { sessionId: item.id })
              }
              activeOpacity={0.7}
            >
              <View style={styles.rowIcon}>
                <Icon name="message-text-outline" size={18} color={colors.primaryDark} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.rowTime}>
                  {formatTimestamp(item.updatedAt)}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {sessions.length > 0 ? (
        <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
          <Text style={styles.clearButtonText}>Clear History</Text>
        </TouchableOpacity>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  search: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text,
    fontSize: 15,
    marginBottom: spacing.md,
  },
  list: {
    paddingBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm + 2,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rowTime: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  clearButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  clearButtonText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },
});
