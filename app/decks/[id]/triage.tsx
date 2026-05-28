import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listCardsByIdsCached } from '@/lib/cache/cardsCache';
import { expandDeckToNextLevel } from '@/lib/db/deckBuilder';
import { getDeck } from '@/lib/db/decks';
import { listByDeck, updateTriage } from '@/lib/db/userCards';
import type { CardRow, DeckRow, UserCardRow } from '@/lib/db/types';
import type { TriageStatus } from '@/lib/seki/types';

interface PendingItem {
  userCard: UserCardRow;
  card: CardRow;
}

interface Stats {
  knownFully: number;
  known: number;
  unknown: number;
}

export default function TriageScreen() {
  const { id: deckId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const isJa = i18n.language === 'ja';
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deck, setDeck] = useState<DeckRow | null>(null);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [index, setIndex] = useState(0);
  // Cumulative across all triage passes for this deck, including reloads
  // after an automatic level expansion.
  const [stats, setStats] = useState<Stats>({ knownFully: 0, known: 0, unknown: 0 });

  const loadPending = useCallback(async () => {
    if (!deckId) return;
    setLoading(true);
    try {
      // Cache the deck once (we need word_count_per_week for the target check).
      const d = deck ?? (await getDeck(deckId));
      if (d) setDeck(d);
      const userCards = await listByDeck(deckId, { triageStatus: 'pending' });
      const cardsById = new Map(
        (await listCardsByIdsCached(userCards.map((uc) => uc.card_id))).map((c) => [c.id, c]),
      );
      const items: PendingItem[] = userCards.flatMap((uc) => {
        const c = cardsById.get(uc.card_id);
        return c ? [{ userCard: uc, card: c }] : [];
      });
      setPending(items);
      setIndex(0);
    } catch (err) {
      Alert.alert('Load failed', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [deckId, deck]);

  useEffect(() => {
    void loadPending();
    // We only want the first load on mount; later reloads go through the
    // explicit code paths in handleTriage. Depending on loadPending here
    // would re-run it every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = pending[index];

  // Reach for the next CEFR level when the user has triaged everything in
  // the current batch but still has fewer "unknown" words than the deck's
  // target W. Returns true if an expansion happened (caller should not
  // close the screen yet).
  const tryExpand = async (currentUnknowns: number): Promise<boolean> => {
    if (!deck || !user) return false;
    if (currentUnknowns >= deck.word_count_per_week) return false;
    const result = await expandDeckToNextLevel(deckId, user.id);
    if (!result.addedLevel || result.addedCount === 0) return false;
    Alert.alert(
      isJa ? 'レベルを追加しました' : 'Added another level',
      isJa
        ? `現在のレベルだけでは目標の ${deck.word_count_per_week} 語に届きません（「知らない」: ${currentUnknowns} 語）。${result.addedLevel} を追加しました（${result.addedCount} 語）。続けてトリアージしてください。`
        : `The selected levels do not hold enough unknown words for the target of ${deck.word_count_per_week} ("don't know": ${currentUnknowns}). ${result.addedLevel} has been added (${result.addedCount} cards). Please continue the triage.`,
      [{ text: 'OK', onPress: () => void loadPending() }],
    );
    return true;
  };

  const finish = (finalStats: Stats) => {
    const target = deck?.word_count_per_week ?? 0;
    Alert.alert(
      isJa ? 'トリアージ完了' : 'Triage complete',
      isJa
        ? `「知らない」 ${finalStats.unknown} 語${
            target > 0 && finalStats.unknown < target
              ? `（目標 ${target} に届きませんでしたが、ここまでの単語でデッキを開始できます）`
              : ''
          }`
        : `${finalStats.unknown} unknown words${
            target > 0 && finalStats.unknown < target
              ? ` (target was ${target}; you can still start the deck with what you have)`
              : ''
          }`,
      [{ text: 'OK', onPress: () => router.back() }],
    );
  };

  const handleTriage = async (status: TriageStatus) => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await updateTriage(current.userCard.id, status);
      const nextStats: Stats = {
        knownFully: stats.knownFully + (status === 'known_fully' ? 1 : 0),
        known: stats.known + (status === 'known' ? 1 : 0),
        unknown: stats.unknown + (status === 'unknown' ? 1 : 0),
      };
      setStats(nextStats);

      // Stop early as soon as the user has secured W unknown words.
      if (deck && nextStats.unknown >= deck.word_count_per_week) {
        finish(nextStats);
        return;
      }

      if (index + 1 >= pending.length) {
        const expanded = await tryExpand(nextStats.unknown);
        if (!expanded) finish(nextStats);
      } else {
        setIndex(index + 1);
      }
    } catch (err) {
      Alert.alert('Save failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (pending.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title">All triaged</ThemedText>
        <ThemedText style={styles.muted}>
          No pending cards. Activate the deck from the Decks tab to start learning.
        </ThemedText>
        <TouchableOpacity style={styles.actionButton} onPress={() => router.back()}>
          <ThemedText style={styles.actionButtonText}>Back</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  if (!current) return null;

  const card = current.card;

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.progress}>
        {index + 1} / {pending.length}
      </ThemedText>
      <ThemedText style={styles.muted}>
        ✓{stats.knownFully + stats.known} · ?{stats.unknown}
        {deck ? ` / ${deck.word_count_per_week}` : ''}
      </ThemedText>

      <ThemedView style={styles.card}>
        <ThemedText style={styles.article}>{card.article ?? ''}</ThemedText>
        <ThemedText style={styles.term}>{card.term_de}</ThemedText>
        {card.levels.length > 0 && (
          <ThemedText style={styles.muted}>level: {card.levels.join(', ')}</ThemedText>
        )}
      </ThemedView>

      <View style={styles.buttonsColumn}>
        <TriageButton
          label={t('triage.knownFully')}
          color="#3a8a4f"
          onPress={() => handleTriage('known_fully')}
          disabled={busy}
        />
        <TriageButton
          label={t('triage.known')}
          color="#a67d2a"
          onPress={() => handleTriage('known')}
          disabled={busy}
        />
        <TriageButton
          label={t('triage.unknown')}
          color="#a63a3a"
          onPress={() => handleTriage('unknown')}
          disabled={busy}
        />
      </View>
    </ThemedView>
  );
}

function TriageButton({
  label,
  color,
  onPress,
  disabled,
}: {
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.tButton, { backgroundColor: color }, disabled && styles.tButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <ThemedText style={styles.tButtonText}>{label}</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  progress: { textAlign: 'center', fontSize: 18, fontWeight: '600' },
  muted: { opacity: 0.6, textAlign: 'center' },
  card: {
    padding: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    gap: 8,
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  article: { fontSize: 18, opacity: 0.6, fontStyle: 'italic', textAlign: 'center' },
  term: { fontSize: 32, fontWeight: '700', marginVertical: 4, textAlign: 'center', lineHeight: 40 },
  buttonsColumn: { gap: 10 },
  tButton: { padding: 16, borderRadius: 10, alignItems: 'center' },
  tButtonDisabled: { opacity: 0.4 },
  tButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  actionButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#666',
    alignItems: 'center',
    marginTop: 16,
  },
  actionButtonText: { fontWeight: '600' },
});
