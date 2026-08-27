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
import BackButton from '../components/BackButton';
import StatusPill from '../components/StatusPill';
import {
  addFact,
  clearAllFacts,
  deleteFact,
  listFacts,
  updateFact,
  type MemoryFact,
  type MemoryFactSource,
} from '../config/memoryStore';
import { colors, radius, spacing } from '../theme/colors';
import type { SettingsStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Memory'>;

const SOURCE_LABEL: Record<MemoryFactSource, string> = {
  onboarding: 'From your interview',
  conversation: 'Learned in conversation',
  manual: 'Added by you',
};

function FactRow({
  fact,
  onSave,
  onDelete,
}: {
  fact: MemoryFact;
  onSave: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fact.text);

  if (editing) {
    return (
      <View style={styles.row}>
        <TextInput
          style={styles.editInput}
          value={draft}
          onChangeText={setDraft}
          multiline
          autoFocus
        />
        <View style={styles.editActions}>
          <TouchableOpacity
            onPress={() => {
              setEditing(false);
              setDraft(fact.text);
            }}
          >
            <Text style={styles.actionTextMuted}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (draft.trim()) onSave(fact.id, draft.trim());
              setEditing(false);
            }}
          >
            <Text style={styles.actionText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Text style={styles.factText}>{fact.text}</Text>
      <View style={styles.rowFooter}>
        <StatusPill label={SOURCE_LABEL[fact.source]} tone="muted" />
        <View style={styles.rowActions}>
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.actionText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(fact.id)}>
            <Text style={styles.actionTextDanger}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/**
 * Full transparency + control over Donna's "central memory" — every
 * stored fact, where it came from, editable and deletable. Consistent
 * with the rest of the app's privacy stance (the Privacy screen's
 * history toggle, the on-device-only architecture): memory is
 * something the user can see and correct, not a black box.
 */
export default function MemoryScreen({ navigation }: Props) {
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [newFactText, setNewFactText] = useState('');
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    listFacts().then(result => {
      setFacts(result);
      setLoaded(true);
    });
  }, []);

  useFocusEffect(reload);

  const handleAdd = async () => {
    const text = newFactText.trim();
    if (!text) return;
    await addFact(text, 'manual');
    setNewFactText('');
    reload();
  };

  const handleSave = async (id: string, text: string) => {
    await updateFact(id, text);
    reload();
  };

  const handleDelete = async (id: string) => {
    await deleteFact(id);
    reload();
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear everything Donna knows about you?',
      'This removes every stored fact from this device. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearAllFacts();
            reload();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Memory</Text>
        <Text style={styles.intro}>
          What Donna knows about you, built from your onboarding interview
          and picked up along the way in conversations. Edit or delete
          anything that's wrong or you'd rather she forget.
        </Text>
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="Add something Donna should know…"
          placeholderTextColor={colors.textFaint}
          value={newFactText}
          onChangeText={setNewFactText}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <TouchableOpacity onPress={handleAdd} style={styles.addButton}>
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      {loaded && facts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptySubtitle}>
            Donna will remember things as you talk, or you can add
            something yourself above.
          </Text>
        </View>
      ) : (
        <FlatList
          data={facts}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <FactRow fact={item} onSave={handleSave} onDelete={handleDelete} />
          )}
        />
      )}

      {facts.length > 0 ? (
        <TouchableOpacity onPress={handleClearAll} style={styles.clearButton}>
          <Text style={styles.clearButtonText}>Clear All Memory</Text>
        </TouchableOpacity>
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
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  intro: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  addInput: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text,
    fontSize: 14,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  addButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  factText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionText: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '600',
  },
  actionTextMuted: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  actionTextDanger: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  editInput: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
    minHeight: 40,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
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
