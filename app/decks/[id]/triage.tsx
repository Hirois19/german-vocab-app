import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listCardsByIdsCached } from '@/lib/cache/cardsCache';
import { expandDeckToNextLevel } from '@/lib/db/deckBuilder';
import { getDeck } from '@/lib/db/decks';
import { countByTriageStatus, listByDeck, updateTriage } from '@/lib/db/userCards';
import type { CardRow, DeckRow, UserCardRow } from '@/lib/db/types';
import { getOrCreate as getOrCreateUserSettings } from '@/lib/db/userSettings';
import type { TriageButton as TriageChoice } from '@/lib/seki/triage';
import { spokenForm } from '@/lib/tts/spokenForm';
import { notify, notifyAsync } from '@/lib/ui/notify';

interface PendingItem {
  userCard: UserCardRow;
  card: CardRow;
}

interface Stats {
  known: number;
  unknown: number;
}

export default function TriageScreen() {
  const { id: deckId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const isJa = i18n.language === 'ja';
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deck, setDeck] = useState<DeckRow | null>(null);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [index, setIndex] = useState(0);
  // Deck totals, not per-sitting: seeded from the database on load so leaving
  // and re-entering the screen continues the count instead of restarting it.
  const [stats, setStats] = useState<Stats>({ known: 0, unknown: 0 });
  // Flipped state of the current card. Reset whenever the card changes.
  const [revealed, setRevealed] = useState(false);
  // What was answered for each card in this sitting. Only needed so that
  // stepping back and changing an answer adjusts the counters correctly.
  const [decided, setDecided] = useState<Record<string, TriageChoice>>({});
  // Mirrors the session screen: read the user's audio-repeat setting once
  // on mount and replay the German term that many times when each new
  // triage card mounts.
  const [audioRepeatCount, setAudioRepeatCount] = useState<1 | 2>(1);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const s = await getOrCreateUserSettings(user.id);
        setAudioRepeatCount(s.audio_repeat_count ?? 1);
      } catch {
        // Defaulting to once is fine if the row can't be fetched.
      }
    })();
  }, [user]);

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
      // Seed the counters from what the deck already holds. Triage is normally
      // spread over several sittings, and both the "W unknowns secured" stop
      // and the level auto-expansion compare against the deck's target.
      setStats(await countByTriageStatus(deckId));
      setPending(items);
      setIndex(0);
      setRevealed(false);
      setDecided({});
    } catch (err) {
      notify('Load failed', (err as Error).message);
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

  // Auto-speak when each triage card appears, same behavior as the session
  // screen. Re-fires only on user_card.id change, so changing the repeat
  // setting mid-card or other re-renders do not replay the audio.
  useEffect(() => {
    if (!current) return;
    setRevealed(false);
    Speech.stop();
    const utterance = spokenForm(current.card);
    Speech.speak(utterance, { language: 'de-DE' });
    if (audioRepeatCount === 2) {
      Speech.speak(utterance, { language: 'de-DE' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.userCard.id]);

  // Reach for the next CEFR level when the user has triaged everything in
  // the current batch but still has fewer "unknown" words than the deck's
  // target W. Returns true if an expansion happened (caller should not
  // close the screen yet).
  const tryExpand = async (currentUnknowns: number): Promise<boolean> => {
    if (!deck || !user) return false;
    if (currentUnknowns >= deck.word_count_per_week) return false;
    const result = await expandDeckToNextLevel(deckId, user.id);
    if (!result.addedLevel || result.addedCount === 0) return false;
    await notifyAsync(
      isJa ? 'レベルを追加しました' : 'Added another level',
      isJa
        ? `現在のレベルだけでは目標の ${deck.word_count_per_week} 語に届きません（「知らない」: ${currentUnknowns} 語）。${result.addedLevel} を追加しました（${result.addedCount} 語）。続けてトリアージしてください。`
        : `The selected levels do not hold enough unknown words for the target of ${deck.word_count_per_week} ("don't know": ${currentUnknowns}). ${result.addedLevel} has been added (${result.addedCount} cards). Please continue the triage.`,
    );
    await loadPending();
    return true;
  };

  const finish = async (finalStats: Stats) => {
    const target = deck?.word_count_per_week ?? 0;
    await notifyAsync(
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
    );
    router.back();
  };

  const goBack = () => {
    if (busy || index === 0) return;
    setIndex(index - 1);
    setRevealed(false);
  };

  const handleTriage = async (status: TriageChoice) => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await updateTriage(current.userCard.id, status);
      // A card reached by stepping back already counted once. Subtract that
      // earlier answer so changing your mind corrects the totals rather than
      // adding to them.
      const previous = decided[current.userCard.id];
      const nextStats: Stats = {
        known: stats.known + (status === 'known' ? 1 : 0) - (previous === 'known' ? 1 : 0),
        unknown: stats.unknown + (status === 'unknown' ? 1 : 0) - (previous === 'unknown' ? 1 : 0),
      };
      setStats(nextStats);
      setDecided((prev) => ({ ...prev, [current.userCard.id]: status }));

      // Stop early as soon as the user has secured W unknown words.
      if (deck && nextStats.unknown >= deck.word_count_per_week) {
        await finish(nextStats);
        return;
      }

      if (index + 1 >= pending.length) {
        const expanded = await tryExpand(nextStats.unknown);
        if (!expanded) await finish(nextStats);
      } else {
        setIndex(index + 1);
      }
    } catch (err) {
      notify('Save failed', (err as Error).message);
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
    <ThemedView style={[styles.container, { paddingBottom: 16 + insets.bottom }]}>
      <ThemedText style={styles.progress}>
        {index + 1} / {pending.length}
      </ThemedText>
      <View style={styles.statusRow}>
        {index > 0 ? (
          <TouchableOpacity
            onPress={goBack}
            disabled={busy}
            style={[styles.backChip, busy && styles.backChipDisabled]}
          >
            <ThemedText style={styles.backChipText}>‹ {isJa ? '戻る' : 'Back'}</ThemedText>
          </TouchableOpacity>
        ) : null}
        <ThemedText style={styles.muted}>
          ✓{stats.known} · ?{stats.unknown}
          {deck ? ` / ${deck.word_count_per_week}` : ''}
        </ThemedText>
      </View>

      {/* The card scrolls on its own so a long term never pushes the two
          decision buttons off the bottom of the screen. */}
      <ScrollView
        style={styles.cardScroll}
        contentContainerStyle={styles.cardScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Tap to check the meaning before deciding. Useful for the words that
            look familiar without quite surfacing. */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setRevealed((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel={isJa ? '意味を表示' : 'Reveal the meaning'}
        >
          <ThemedView style={styles.card}>
            <ThemedText style={styles.article}>{card.article ?? ''}</ThemedText>
            <ThemedText style={styles.term}>{card.term_de}</ThemedText>
            {card.levels.length > 0 && (
              <ThemedText style={styles.muted}>level: {card.levels.join(', ')}</ThemedText>
            )}

            {revealed ? (
              <View style={styles.backFace}>
                {card.translations_ja.length > 0 && (
                  <ThemedText style={styles.translation}>
                    {card.translations_ja.join(' / ')}
                  </ThemedText>
                )}
                {card.translations_en.length > 0 && (
                  <ThemedText style={styles.translationEn}>
                    {card.translations_en.join(' / ')}
                  </ThemedText>
                )}
                {card.plural && <ThemedText style={styles.muted}>Pl: {card.plural}</ThemedText>}
              </View>
            ) : (
              <ThemedText style={styles.flipHint}>
                {isJa ? 'タップして意味を表示' : 'Tap to reveal'}
              </ThemedText>
            )}
          </ThemedView>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.buttonsColumn}>
        <TriageButton
          label={t('triage.known')}
          color="#3a8a4f"
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
  statusRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  backChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#0a7ea4',
  },
  backChipDisabled: { opacity: 0.4 },
  backChipText: { color: '#0a7ea4', fontWeight: '600' },
  cardScroll: { flex: 1 },
  cardScrollContent: { flexGrow: 1, justifyContent: 'center' },
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
  backFace: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#666',
    gap: 6,
  },
  translation: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  translationEn: { fontSize: 15, opacity: 0.75, textAlign: 'center' },
  flipHint: { textAlign: 'center', fontSize: 12, opacity: 0.45, marginTop: 10 },
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
