import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useUserChanges } from '@/lib/realtime/useUserChanges';
import { createWeakDeck, listAvailableWeakCardIds } from '@/lib/db/deckBuilder';
import {
  activateDeck,
  DeckNameError,
  deleteDeck,
  listDecks,
  pauseActiveDeck,
  renameDeck,
  switchActiveDeck,
} from '@/lib/db/decks';
import type { DeckRow } from '@/lib/db/types';
import { MAX_DECK_NAME_LENGTH } from '@/lib/seki/deckName';
import { confirmAsync } from '@/lib/ui/confirm';
import { notify } from '@/lib/ui/notify';

const STATUS_COLORS: Record<DeckRow['status'], string> = {
  active: '#3a8a4f',
  paused: '#a67d2a',
  pending: '#6a6a6a',
  completed: '#3a5e8a',
};

export default function DecksScreen() {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const isJa = i18n.language === 'ja';
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [weakPoolSize, setWeakPoolSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [ds, weakIds] = await Promise.all([
        listDecks(user.id),
        listAvailableWeakCardIds(user.id),
      ]);
      setDecks(ds);
      setWeakPoolSize(weakIds.length);
    } catch (err) {
      notify('Load error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleCreateWeakDeck = async () => {
    if (!user) return;
    const W = weakPoolSize >= 700 ? 700 : weakPoolSize >= 350 ? 350 : Math.max(7, weakPoolSize);
    const ok = await confirmAsync({
      title: 'Create 苦手デッキ',
      message: `Take the first ${Math.min(W, weakPoolSize)} weak words and form a new SEKI 7×7 deck?`,
      confirmLabel: 'Create',
    });
    if (!ok) return;
    setBusyId('__weak__');
    try {
      const existingWeakCount = decks.filter((d) => d.kind === 'weak').length;
      const name = `苦手デッキ #${existingWeakCount + 1}`;
      await createWeakDeck({ userId: user.id, name, wordCountPerWeek: W });
      await refresh();
    } catch (err) {
      notify('Create weak deck failed', (err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useUserChanges(user?.id ?? null, refresh);

  const handleActivate = async (deck: DeckRow) => {
    if (!user) return;
    setBusyId(deck.id);
    try {
      await switchActiveDeck(user.id, deck.id);
      await refresh();
    } catch (err) {
      notify('Activate failed', (err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handlePause = async () => {
    if (!user) return;
    setBusyId('__pause__');
    try {
      await pauseActiveDeck(user.id);
      await refresh();
    } catch (err) {
      notify('Pause failed', (err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (deck: DeckRow) => {
    const ok = await confirmAsync({
      title: `Delete "${deck.name}"?`,
      message:
        'This permanently removes the deck and all of its cards, reviews, and tags. This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(deck.id);
    try {
      await deleteDeck(deck.id);
      await refresh();
    } catch (err) {
      notify('Delete failed', (err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  // Returns true when the rename was saved (or was a no-op), so the card can
  // leave edit mode. On failure the card stays in edit mode with the dialog shown.
  const handleRename = async (deck: DeckRow, rawName: string): Promise<boolean> => {
    if (rawName.trim() === deck.name) return true;
    setBusyId(deck.id);
    try {
      await renameDeck(deck.id, rawName);
      await refresh();
      return true;
    } catch (err) {
      if (err instanceof DeckNameError) {
        notify(
          isJa ? '名前を変更できません' : 'Cannot rename',
          deckNameErrorMessage(err.code, isJa),
        );
      } else {
        notify('Rename failed', (err as Error).message);
      }
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleResume = async (deck: DeckRow) => {
    if (!user) return;
    setBusyId(deck.id);
    try {
      // If another deck is active, switch; otherwise just activate.
      const anyActive = decks.find((d) => d.status === 'active');
      if (anyActive && anyActive.id !== deck.id) {
        await switchActiveDeck(user.id, deck.id);
      } else {
        await activateDeck(deck.id);
      }
      await refresh();
    } catch (err) {
      notify('Resume failed', (err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading && decks.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">All decks</ThemedText>
        <View style={styles.headerButtons}>
          <Link href="/tags" asChild>
            <TouchableOpacity style={styles.secondaryButton}>
              <ThemedText style={styles.secondaryButtonText}>Tags</ThemedText>
            </TouchableOpacity>
          </Link>
          <Link href="/decks/new" asChild>
            <TouchableOpacity style={styles.newButton}>
              <ThemedText style={styles.newButtonText}>+ New</ThemedText>
            </TouchableOpacity>
          </Link>
        </View>
      </View>

      {weakPoolSize > 0 && (
        <TouchableOpacity
          style={[styles.weakBanner, busyId === '__weak__' && styles.actionButtonDisabled]}
          onPress={handleCreateWeakDeck}
          disabled={busyId === '__weak__'}
        >
          <ThemedText style={styles.weakBannerText}>
            苦手プール: {weakPoolSize} words ready
          </ThemedText>
          <ThemedText style={styles.weakBannerSubtext}>Tap to spawn a new 苦手デッキ</ThemedText>
        </TouchableOpacity>
      )}

      {decks.length === 0 ? (
        <ThemedText style={styles.muted}>
          No decks yet. Tap &quot;+ New&quot; to create your first SEKI 7×7 deck.
        </ThemedText>
      ) : (
        <FlatList
          data={decks}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <DeckCard
              deck={item}
              busy={busyId === item.id || (busyId === '__pause__' && item.status === 'active')}
              onActivate={() => handleActivate(item)}
              onPause={handlePause}
              onResume={() => handleResume(item)}
              onStartTriage={() =>
                router.push({ pathname: '/decks/[id]/triage', params: { id: item.id } })
              }
              onStartSession={() =>
                router.push({ pathname: '/decks/[id]/session', params: { id: item.id } })
              }
              onDelete={() => handleDelete(item)}
              onRename={(name) => handleRename(item, name)}
              isJa={isJa}
            />
          )}
        />
      )}
    </ThemedView>
  );
}

interface DeckCardProps {
  deck: DeckRow;
  busy: boolean;
  onActivate: () => void;
  onPause: () => void;
  onResume: () => void;
  onStartTriage: () => void;
  onStartSession: () => void;
  onDelete: () => void;
  onRename: (name: string) => Promise<boolean>;
  isJa: boolean;
}

function DeckCard({
  deck,
  busy,
  onActivate,
  onPause,
  onResume,
  onStartTriage,
  onStartSession,
  onDelete,
  onRename,
  isJa,
}: DeckCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(deck.name);
  const cycle = Math.ceil(deck.current_day / 7);
  const batch = ((deck.current_day - 1) % 7) + 1;

  const startRename = () => {
    setDraft(deck.name);
    setEditing(true);
  };
  const saveRename = async () => {
    if (await onRename(draft)) setEditing(false);
  };

  return (
    <ThemedView style={styles.card}>
      <View style={styles.cardHeader}>
        {editing ? (
          <TextInput
            style={styles.nameInput}
            value={draft}
            onChangeText={setDraft}
            maxLength={MAX_DECK_NAME_LENGTH}
            autoFocus
            editable={!busy}
            onSubmitEditing={saveRename}
            returnKeyType="done"
          />
        ) : (
          <ThemedText type="subtitle">{deck.name}</ThemedText>
        )}
        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[deck.status] }]}>
          <ThemedText style={styles.statusText}>{deck.status}</ThemedText>
        </View>
      </View>
      <ThemedText style={styles.muted}>
        {deck.kind === 'weak' ? '苦手デッキ' : 'メインデッキ'} · W={deck.word_count_per_week}
      </ThemedText>
      <ThemedText style={styles.muted}>
        Day {deck.current_day}/49 · Cycle {cycle}/7 · Batch {batch}/7
      </ThemedText>

      <View style={styles.actions}>
        {deck.status === 'pending' && (
          <>
            <ActionButton label="Triage" onPress={onStartTriage} disabled={busy} primary />
            <ActionButton label="Activate" onPress={onActivate} disabled={busy} />
          </>
        )}
        {deck.status === 'active' && (
          <>
            <ActionButton label="Start session" onPress={onStartSession} disabled={busy} primary />
            <ActionButton label="Pause" onPress={onPause} disabled={busy} />
          </>
        )}
        {deck.status === 'paused' && (
          <ActionButton label="Resume" onPress={onResume} disabled={busy} primary />
        )}
        {deck.status === 'completed' && (
          <ThemedText style={styles.muted}>Completed all 49 days.</ThemedText>
        )}
        {editing ? (
          <>
            <ActionButton
              label={isJa ? '保存' : 'Save'}
              onPress={saveRename}
              disabled={busy}
              primary
            />
            <ActionButton
              label={isJa ? 'キャンセル' : 'Cancel'}
              onPress={() => setEditing(false)}
              disabled={busy}
            />
          </>
        ) : (
          <ActionButton
            label={isJa ? '名前を変更' : 'Rename'}
            onPress={startRename}
            disabled={busy}
          />
        )}
        <TouchableOpacity
          style={[styles.deleteButton, busy && styles.actionButtonDisabled]}
          onPress={onDelete}
          disabled={busy}
        >
          <ThemedText style={styles.deleteButtonText}>Delete</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

function deckNameErrorMessage(code: DeckNameError['code'], isJa: boolean): string {
  switch (code) {
    case 'empty':
      return isJa ? 'デッキ名を入力してください。' : 'Enter a deck name.';
    case 'too_long':
      return isJa
        ? `デッキ名は ${MAX_DECK_NAME_LENGTH} 文字以内にしてください。`
        : `The deck name can be at most ${MAX_DECK_NAME_LENGTH} characters.`;
    case 'duplicate':
      return isJa
        ? '同じ名前のデッキがすでにあります。別の名前を付けてください。'
        : 'A deck with this name already exists. Please choose another name.';
  }
}

function ActionButton({
  label,
  onPress,
  disabled,
  primary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        primary && styles.actionButtonPrimary,
        disabled && styles.actionButtonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <ThemedText style={[styles.actionButtonText, primary && styles.actionButtonTextPrimary]}>
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerButtons: { flexDirection: 'row', gap: 8 },
  secondaryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0a7ea4',
  },
  secondaryButtonText: { color: '#0a7ea4', fontWeight: '600' },
  newButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#0a7ea4',
  },
  newButtonText: { color: '#fff', fontWeight: '600' },
  muted: { opacity: 0.6 },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    gap: 6,
  },
  nameInput: {
    flex: 1,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 16,
    color: '#fff',
    backgroundColor: '#1a1a1a',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusText: { color: '#fff', fontSize: 12, textTransform: 'uppercase', fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#666',
  },
  actionButtonPrimary: { backgroundColor: '#0a7ea4', borderColor: '#0a7ea4' },
  actionButtonDisabled: { opacity: 0.4 },
  actionButtonText: { fontWeight: '600' },
  actionButtonTextPrimary: { color: '#fff' },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#a63a3a',
    marginLeft: 'auto',
  },
  deleteButtonText: { color: '#a63a3a', fontWeight: '600' },
  weakBanner: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#7d3a3a',
    gap: 2,
  },
  weakBannerText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  weakBannerSubtext: { color: '#fff', opacity: 0.85, fontSize: 13 },
});
