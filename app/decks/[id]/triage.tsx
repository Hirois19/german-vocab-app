import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { listCardsByIdsCached } from '@/lib/cache/cardsCache';
import { listByDeck, updateTriage } from '@/lib/db/userCards';
import type { CardRow, UserCardRow } from '@/lib/db/types';
import type { TriageStatus } from '@/lib/seki/types';

interface PendingItem {
  userCard: UserCardRow;
  card: CardRow;
}

export default function TriageScreen() {
  const { id: deckId } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [index, setIndex] = useState(0);
  const [stats, setStats] = useState({ knownFully: 0, known: 0, unknown: 0 });

  const loadPending = useCallback(async () => {
    if (!deckId) return;
    setLoading(true);
    try {
      const userCards = await listByDeck(deckId, { triageStatus: 'pending' });
      // Bulk-fetch instead of N+1 getCard per pending user_card.
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
  }, [deckId]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  const current = pending[index];

  const handleTriage = async (status: TriageStatus) => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await updateTriage(current.userCard.id, status);
      setStats((s) => ({
        knownFully: s.knownFully + (status === 'known_fully' ? 1 : 0),
        known: s.known + (status === 'known' ? 1 : 0),
        unknown: s.unknown + (status === 'unknown' ? 1 : 0),
      }));
      if (index + 1 >= pending.length) {
        Alert.alert(
          'Triage complete',
          `Done. ${stats.unknown + (status === 'unknown' ? 1 : 0)} unknown words remain in the deck.`,
          [{ text: 'OK', onPress: () => router.back() }],
        );
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
    alignItems: 'center',
  },
  article: { fontSize: 18, opacity: 0.6, fontStyle: 'italic' },
  term: { fontSize: 36, fontWeight: '700', marginVertical: 4 },
  translation: { fontSize: 18, textAlign: 'center' },
  translationEn: { fontSize: 14, opacity: 0.7, textAlign: 'center' },
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
