import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';

import { TagPicker } from '@/components/tag-picker';
import { SyncStatus } from '@/components/sync-status';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listCardsByIdsCached } from '@/lib/cache/cardsCache';
import { evaluateWeakOnCompletion } from '@/lib/db/deckBuilder';
import { getDeck } from '@/lib/db/decks';
import type { CardRow, DeckRow, UserCardRow } from '@/lib/db/types';
import { listActiveByDeck } from '@/lib/db/userCards';
import { batchAssignmentForDay } from '@/lib/seki/scheduler';
import type { Rating } from '@/lib/seki/types';
import { effectiveDeck, sessionBatch, type TriageButton } from '@/lib/seki/triage';
import { isOfflineError } from '@/lib/sync/connectivity';
import {
  queuedAdvanceDeckDay,
  queuedIncrementNoCount,
  queuedUpdateTriage,
  queuedUpsertReview,
} from '@/lib/sync/queuedWrites';
import { loadSessionSnapshot, saveSessionSnapshot } from '@/lib/sync/sessionSnapshot';

interface SessionCard {
  userCard: UserCardRow;
  card: CardRow;
}

export default function SessionScreen() {
  const { id: deckId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deck, setDeck] = useState<DeckRow | null>(null);
  const [cards, setCards] = useState<SessionCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  const load = useCallback(async () => {
    if (!deckId || !user) return;
    setLoading(true);
    try {
      // Load the deck + its non-excluded cards. When offline, fall back to the
      // last snapshot so a session can still be started in airplane mode.
      let d: DeckRow;
      let active: UserCardRow[];
      try {
        const fetched = await getDeck(deckId);
        if (!fetched) throw new Error('Deck not found');
        d = fetched;
        active = await listActiveByDeck(deckId);
        await saveSessionSnapshot(deckId, { deck: d, userCards: active });
      } catch (err) {
        if (!isOfflineError(err)) throw err;
        const snap = await loadSessionSnapshot(deckId);
        if (!snap) throw err;
        d = snap.deck;
        active = snap.userCards;
      }
      setDeck(d);
      // The effective deck is the first W cards (by position) that still occupy
      // a slot — i.e. not triaged as pre-known. In progressive mode the deck is
      // provisioned with the whole candidate pool, so as the user marks words
      // 'known' inline the later candidates backfill into the effective deck.
      const eff = effectiveDeck(active, d.word_count_per_week);
      const assignment = batchAssignmentForDay(d.current_day, d.word_count_per_week, eff.length);
      // This day's batch, plus any untriaged stragglers carried over from
      // earlier batches (progressive-mode backfill).
      const sessionable = sessionBatch(eff, assignment.wordStart, assignment.wordEnd);
      // Bulk-fetch all cards in one round trip instead of N+1.
      const cardsById = new Map(
        (await listCardsByIdsCached(sessionable.map((uc) => uc.card_id))).map((c) => [c.id, c]),
      );
      const enriched: SessionCard[] = [];
      for (const uc of sessionable) {
        const c = cardsById.get(uc.card_id);
        if (c) enriched.push({ userCard: uc, card: c });
      }
      setCards(enriched);
      setIndex(0);
      setRevealed(false);
    } catch (err) {
      Alert.alert('Load failed', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [deckId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = cards[index];

  const speak = () => {
    if (!current) return;
    Speech.stop();
    Speech.speak(current.card.term_de, { language: 'de-DE' });
  };

  const advanceOrFinish = async () => {
    if (!deck || !user) return;
    if (index + 1 >= cards.length) {
      const advanced = await queuedAdvanceDeckDay(deck);
      if (advanced.isComplete) {
        try {
          const summary = await evaluateWeakOnCompletion(deck.id, user.id);
          Alert.alert(
            'Deck complete!',
            `Weak: ${summary.weak} · Mastered: ${summary.mastered}. ` +
              'Visit the Decks tab to spawn a 苦手デッキ from the weak pool.',
          );
        } catch (e) {
          Alert.alert('Deck complete!', `Could not evaluate weak words: ${(e as Error).message}`);
        }
      } else {
        Alert.alert('Session complete', `Tomorrow: Day ${advanced.deck.current_day}.`);
      }
      router.back();
    } else {
      setIndex(index + 1);
      setRevealed(false);
    }
  };

  const handleTriage = async (status: TriageButton) => {
    if (!current || busy) return;
    setBusy(true);
    try {
      const updated = await queuedUpdateTriage(current.userCard, status);
      // Reflect the new triage state in our local copy so we can pivot to
      // the reveal/rate UI immediately for 'unknown'.
      setCards((prev) => prev.map((c, i) => (i === index ? { ...c, userCard: updated } : c)));
      if (status !== 'unknown') {
        // Pre-known: skip review, move on.
        await advanceOrFinish();
      }
      // For 'unknown' we stay on the same card and the reveal/rate UI will render next.
    } catch (err) {
      Alert.alert('Triage save failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rate = async (rating: Rating) => {
    if (!current || !deck || !user || busy) return;
    setBusy(true);
    try {
      const cycle = Math.ceil(deck.current_day / 7);
      const batch = ((deck.current_day - 1) % 7) + 1;
      await queuedUpsertReview({
        userId: user.id,
        userCardId: current.userCard.id,
        cycle,
        batch,
        day: deck.current_day,
        rating,
      });
      if (rating === 'NO') {
        await queuedIncrementNoCount(current.userCard.id);
      }
      await advanceOrFinish();
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

  if (!deck) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Deck not found.</ThemedText>
      </ThemedView>
    );
  }

  if (cards.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title">Nothing to review</ThemedText>
        <ThemedText style={styles.muted}>
          No &quot;unknown&quot; cards for today&apos;s batch. Run triage first, or every card in
          this batch is already pre-known.
        </ThemedText>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ThemedText style={styles.backButtonText}>Back</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  if (!current) return null;

  const card = current.card;
  const cycle = Math.ceil(deck.current_day / 7);
  const batch = ((deck.current_day - 1) % 7) + 1;

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.progress}>
        Day {deck.current_day}/49 · Cycle {cycle} · Batch {batch}
      </ThemedText>
      <View style={styles.statusRow}>
        <ThemedText style={styles.muted}>
          {index + 1} / {cards.length}
        </ThemedText>
        <SyncStatus />
      </View>

      <ThemedView style={styles.card}>
        <ThemedText style={styles.article}>{card.article ?? ''}</ThemedText>
        <ThemedText style={styles.term}>{card.term_de}</ThemedText>
        {(() => {
          // Prefer the per-user editable tag set; fall back to the shared
          // source-data categories until the user_cards.tags migration has run.
          const displayTags =
            current.userCard.tags && current.userCard.tags.length > 0
              ? current.userCard.tags
              : (card.categories ?? []);
          return displayTags.length > 0 ? (
            <View style={styles.categoriesRow}>
              {displayTags.map((cat) => (
                <View key={cat} style={styles.categoryChip}>
                  <ThemedText style={styles.categoryChipText}>{cat}</ThemedText>
                </View>
              ))}
            </View>
          ) : null;
        })()}
        <View style={styles.cardActions}>
          <TouchableOpacity onPress={speak} style={styles.ttsButton}>
            <ThemedText style={styles.ttsButtonText}>🔊 Speak</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTagPickerOpen(true)} style={styles.ttsButton}>
            <ThemedText style={styles.ttsButtonText}>🏷 Tag</ThemedText>
          </TouchableOpacity>
        </View>

        {revealed && (
          <View style={styles.backFace}>
            {card.translations_ja.length > 0 && (
              <ThemedText style={styles.translation}>{card.translations_ja.join(' / ')}</ThemedText>
            )}
            {card.translations_en.length > 0 && (
              <ThemedText style={styles.translationEn}>
                {card.translations_en.join(' / ')}
              </ThemedText>
            )}
            {card.prateritum && (
              <ThemedText style={styles.muted}>Prät: {card.prateritum}</ThemedText>
            )}
            {card.partizip_ii && (
              <ThemedText style={styles.muted}>PII: {card.partizip_ii}</ThemedText>
            )}
            {card.plural && <ThemedText style={styles.muted}>Pl: {card.plural}</ThemedText>}
            {card.examples.length > 0 && (
              <ThemedText style={styles.example}>{card.examples[0]}</ThemedText>
            )}
          </View>
        )}
      </ThemedView>

      {current.userCard.triage_status === 'pending' ? (
        <View style={styles.triageColumn}>
          <ThemedText style={styles.triagePrompt}>{t('triage.prompt')}</ThemedText>
          <RatingButton
            label={t('triage.knownFully')}
            color="#3a8a4f"
            onPress={() => handleTriage('known_fully')}
            disabled={busy}
          />
          <RatingButton
            label={t('triage.known')}
            color="#a67d2a"
            onPress={() => handleTriage('known')}
            disabled={busy}
          />
          <RatingButton
            label={t('triage.unknown')}
            color="#a63a3a"
            onPress={() => handleTriage('unknown')}
            disabled={busy}
          />
        </View>
      ) : !revealed ? (
        <TouchableOpacity style={styles.revealButton} onPress={() => setRevealed(true)}>
          <ThemedText style={styles.revealButtonText}>Reveal</ThemedText>
        </TouchableOpacity>
      ) : (
        <View style={styles.ratingRow}>
          <RatingButton label="NO" color="#a63a3a" onPress={() => rate('NO')} disabled={busy} />
          <RatingButton label="HALF" color="#a67d2a" onPress={() => rate('HALF')} disabled={busy} />
          <RatingButton label="YES" color="#3a8a4f" onPress={() => rate('YES')} disabled={busy} />
        </View>
      )}

      <TagPicker
        visible={tagPickerOpen}
        userCardId={current.userCard.id}
        currentTags={
          current.userCard.tags && current.userCard.tags.length > 0
            ? current.userCard.tags
            : (card.categories ?? [])
        }
        onTagsChanged={(tags) => {
          setCards((prev) =>
            prev.map((c, i) => (i === index ? { ...c, userCard: { ...c.userCard, tags } } : c)),
          );
        }}
        onClose={() => setTagPickerOpen(false)}
      />
    </ThemedView>
  );
}

function RatingButton({
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
      style={[styles.rButton, { backgroundColor: color }, disabled && styles.rButtonDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <ThemedText style={styles.rButtonText}>{label}</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  progress: { textAlign: 'center', fontSize: 16, fontWeight: '600' },
  statusRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  muted: { opacity: 0.6, textAlign: 'center' },
  card: {
    padding: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    gap: 8,
    minHeight: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },
  article: { fontSize: 18, opacity: 0.6, fontStyle: 'italic' },
  term: { fontSize: 36, fontWeight: '700', marginVertical: 4, textAlign: 'center' },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    marginTop: 8,
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#0a7ea4',
  },
  categoryChipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  ttsButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#888',
  },
  ttsButtonText: { fontWeight: '600' },
  backFace: { gap: 4, marginTop: 16, alignItems: 'center' },
  translation: { fontSize: 18, textAlign: 'center' },
  translationEn: { fontSize: 14, opacity: 0.7, textAlign: 'center' },
  example: { fontSize: 14, fontStyle: 'italic', marginTop: 4, textAlign: 'center' },
  revealButton: {
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#0a7ea4',
    alignItems: 'center',
  },
  revealButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  ratingRow: { flexDirection: 'row', gap: 8 },
  triageColumn: { gap: 8 },
  triagePrompt: { textAlign: 'center', opacity: 0.7, marginBottom: 4 },
  rButton: { flex: 1, padding: 16, borderRadius: 10, alignItems: 'center' },
  rButtonDisabled: { opacity: 0.4 },
  rButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  backButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#666',
    alignItems: 'center',
    marginTop: 16,
  },
  backButtonText: { fontWeight: '600' },
});
