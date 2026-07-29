import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TagPicker } from '@/components/tag-picker';
import { SyncStatus } from '@/components/sync-status';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listCardsByIdsCached } from '@/lib/cache/cardsCache';
import { evaluateWeakOnCompletion } from '@/lib/db/deckBuilder';
import { getDeck } from '@/lib/db/decks';
import { listReviewsForDay } from '@/lib/db/reviews';
import type { CardRow, DeckRow, UserCardRow } from '@/lib/db/types';
import { listActiveByDeck } from '@/lib/db/userCards';
import { getOrCreate as getOrCreateUserSettings } from '@/lib/db/userSettings';
import { batchAssignmentForDay } from '@/lib/seki/scheduler';
import type { RatingButton as RatingChoice } from '@/lib/seki/types';
import { dailyShuffleSeed, seededShuffle } from '@/lib/seki/shuffle';
import { effectiveDeck, sessionBatch, type TriageButton } from '@/lib/seki/triage';
import { spokenForm } from '@/lib/tts/spokenForm';
import { isOfflineError } from '@/lib/sync/connectivity';
import {
  queuedAdvanceDeckDay,
  queuedIncrementNoCount,
  queuedUpdateTriage,
  queuedUpsertReview,
} from '@/lib/sync/queuedWrites';
import { loadDayProgress, recordRated, recordTriage } from '@/lib/sync/dayProgress';
import { loadSessionSnapshot, saveSessionSnapshot } from '@/lib/sync/sessionSnapshot';

interface SessionCard {
  userCard: UserCardRow;
  card: CardRow;
}

export default function SessionScreen() {
  const { id: deckId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const isJa = i18n.language === 'ja';
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deck, setDeck] = useState<DeckRow | null>(null);
  const [cards, setCards] = useState<SessionCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  // User-tunable: speak the term once or twice when the card is revealed.
  // Default to 1 until settings are loaded; the manual TTS button is unaffected.
  const [audioRepeatCount, setAudioRepeatCount] = useState<1 | 2>(1);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const s = await getOrCreateUserSettings(user.id);
        setAudioRepeatCount(s.audio_repeat_count ?? 1);
      } catch {
        // Defaulting to once is fine if the row can't be fetched (offline,
        // first ever load before migration applied, etc.).
      }
    })();
  }, [user]);

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
      const batch = sessionBatch(eff, assignment.wordStart, assignment.wordEnd);
      // Randomize the within-day order using a (deck, day) seed. Same day
      // always shuffles the same way (reloading does not reshuffle), and
      // each new day gets a different order. Batch membership itself is not
      // touched, so day N+1 does not steal day N's cards.
      const sessionable = seededShuffle(batch, dailyShuffleSeed(deckId, d.current_day));
      // Bulk-fetch all cards in one round trip instead of N+1.
      const cardsById = new Map(
        (await listCardsByIdsCached(sessionable.map((uc) => uc.card_id))).map((c) => [c.id, c]),
      );
      const enriched: SessionCard[] = [];
      for (const uc of sessionable) {
        const c = cardsById.get(uc.card_id);
        if (c) enriched.push({ userCard: uc, card: c });
      }

      // Resume to the first card the user still needs to act on, so a session
      // interrupted by an app switch / browser tab kill continues where they
      // left off instead of resetting to position 1. Cards already rated this
      // day, and cards triaged as known earlier today, are skipped.
      const ratedThisDay = new Set<string>();
      // Local first: this works fully offline and reflects writes still sitting
      // in the outbox. When we fell back to the offline snapshot above, the
      // cards' triage_status is stale (pre-today); overlay the day's recorded
      // triage decisions so already-known cards are correctly skipped on resume.
      try {
        const progress = await loadDayProgress(deckId, d.current_day);
        progress.rated.forEach((id) => ratedThisDay.add(id));
        if (Object.keys(progress.triaged).length > 0) {
          for (let i = 0; i < enriched.length; i += 1) {
            const sc = enriched[i];
            const localStatus = sc && progress.triaged[sc.userCard.id];
            if (sc && localStatus) {
              enriched[i] = { ...sc, userCard: { ...sc.userCard, triage_status: localStatus } };
            }
          }
        }
      } catch {
        // Resume is a UX nicety: a cache read failure must never crash the load.
      }
      // Enrich with the server's record when reachable. This covers a fresh
      // install or a second device whose local cache is empty. Offline this
      // throws and we keep just the local set, which is enough to resume this
      // device's own in-progress day.
      try {
        const reviews = await listReviewsForDay(deckId, user.id, d.current_day);
        reviews.forEach((r) => ratedThisDay.add(r.user_card_id));
      } catch (queryErr) {
        if (!isOfflineError(queryErr)) {
          console.warn('Failed to load reviews for day resume', queryErr);
        }
      }
      let resumeIndex = -1;
      for (let i = 0; i < enriched.length; i += 1) {
        const sc = enriched[i];
        if (!sc) continue;
        const uc = sc.userCard;
        const needsTriage = uc.triage_status === 'pending';
        const needsRating = uc.triage_status === 'unknown' && !ratedThisDay.has(uc.id);
        if (needsTriage || needsRating) {
          resumeIndex = i;
          break;
        }
      }
      // If every card already has an action recorded but the day did not
      // advance (rare race), drop the user on the first card; they can rate
      // it again to trigger `advanceOrFinish`.
      if (resumeIndex === -1) resumeIndex = 0;

      setCards(enriched);
      setIndex(resumeIndex);
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

  // Manual TTS button: always one playback regardless of the auto-repeat
  // setting, since the user is explicitly asking for another listen.
  const speak = () => {
    if (!current) return;
    Speech.stop();
    Speech.speak(spokenForm(current.card), { language: 'de-DE' });
  };

  // Auto-speak as soon as a new card appears, so the user hears the German
  // term before they decide whether to reveal the translation. Re-firing on
  // card change (id) only, so changing the repeat-count setting mid-card or
  // tapping Reveal does not replay the audio.
  useEffect(() => {
    if (!current) return;
    Speech.stop();
    const utterance = spokenForm(current.card);
    Speech.speak(utterance, { language: 'de-DE' });
    if (audioRepeatCount === 2) {
      Speech.speak(utterance, { language: 'de-DE' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.userCard.id]);

  // Flip the card AND replay the German term: easier than reaching for the
  // manual speaker mid-flip. Once revealed, the next action is a rating, so a
  // second tap does nothing rather than flipping back.
  const canFlip = !!current && current.userCard.triage_status !== 'pending' && !revealed;

  const flip = () => {
    if (!canFlip) return;
    setRevealed(true);
    speak();
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
      // Persist the decision for offline resume: after a reload from the
      // offline snapshot the card's triage_status is stale, so without this a
      // known card would reappear as pending and resume would land on it.
      if (deck) await recordTriage(deck.id, deck.current_day, current.userCard.id, status);
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

  // Track which cards have already had their no_count incremented this session
  // so that going back and re-rating the same card NO does not inflate the count.
  const [noIncremented, setNoIncremented] = useState<Set<string>>(new Set());

  const rate = async (rating: RatingChoice) => {
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
      // Record locally so an interrupted session resumes past this card even
      // when fully offline (the server query in load() is unreachable then).
      await recordRated(deck.id, deck.current_day, current.userCard.id);
      if (rating === 'NO' && !noIncremented.has(current.userCard.id)) {
        await queuedIncrementNoCount(current.userCard.id);
        setNoIncremented((prev) => new Set(prev).add(current.userCard.id));
      }
      await advanceOrFinish();
    } catch (err) {
      Alert.alert('Save failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Step back to the most recent previously-revealed card. Cards triaged as
  // 'known' / 'known_fully' were never actually flipped, so they are skipped.
  const goBack = () => {
    if (busy) return;
    for (let i = index - 1; i >= 0; i -= 1) {
      const c = cards[i];
      if (c && c.userCard.triage_status === 'unknown') {
        setIndex(i);
        setRevealed(true);
        return;
      }
    }
  };

  const hasPrevious = (() => {
    for (let i = index - 1; i >= 0; i -= 1) {
      const c = cards[i];
      if (c && c.userCard.triage_status === 'unknown') return true;
    }
    return false;
  })();

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
    // The rating row sits at the bottom edge, so it needs the safe-area inset
    // to clear the home indicator and the mobile browser toolbar.
    <ThemedView style={[styles.container, { paddingBottom: 16 + insets.bottom }]}>
      <ThemedText style={styles.progress}>
        Day {deck.current_day}/49 · Cycle {cycle} · Batch {batch}
      </ThemedText>
      <View style={styles.statusRow}>
        {hasPrevious ? (
          <TouchableOpacity
            onPress={goBack}
            disabled={busy}
            style={[styles.backChip, busy && styles.backChipDisabled]}
          >
            <ThemedText style={styles.backChipText}>
              ‹ {i18n.language === 'ja' ? '戻る' : 'Back'}
            </ThemedText>
          </TouchableOpacity>
        ) : null}
        <ThemedText style={styles.muted}>
          {index + 1} / {cards.length}
        </ThemedText>
        <SyncStatus />
      </View>

      <ScrollView
        style={styles.cardScroll}
        contentContainerStyle={styles.cardScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Tapping the card itself flips it, the way a physical flashcard
            works. Disabled while the card is still awaiting triage: the point
            of that step is to answer before seeing the meaning. */}
        <TouchableOpacity
          activeOpacity={canFlip ? 0.85 : 1}
          onPress={flip}
          disabled={!canFlip}
          accessibilityRole="button"
          accessibilityLabel={isJa ? '意味を表示' : 'Reveal the meaning'}
        >
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
                  <ThemedText style={styles.translation}>
                    {card.translations_ja.join(' / ')}
                  </ThemedText>
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

            {canFlip && (
              <ThemedText style={styles.flipHint}>
                {isJa ? 'タップして意味を表示' : 'Tap to reveal'}
              </ThemedText>
            )}
          </ThemedView>
        </TouchableOpacity>
      </ScrollView>

      {current.userCard.triage_status === 'pending' ? (
        <View style={styles.triageColumn}>
          <ThemedText style={styles.triagePrompt}>{t('triage.prompt')}</ThemedText>
          <RatingButton
            label={t('triage.known')}
            color="#3a8a4f"
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
        <TouchableOpacity style={styles.revealButton} onPress={flip}>
          <ThemedText style={styles.revealButtonText}>Reveal</ThemedText>
        </TouchableOpacity>
      ) : (
        <View style={styles.ratingRow}>
          <RatingButton label="NO" color="#a63a3a" onPress={() => rate('NO')} disabled={busy} />
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
  backChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#0a7ea4',
  },
  backChipDisabled: { opacity: 0.4 },
  backChipText: { color: '#0a7ea4', fontWeight: '700', fontSize: 13 },
  cardScroll: { flex: 1 },
  cardScrollContent: { flexGrow: 1, justifyContent: 'center' },
  muted: { opacity: 0.6, textAlign: 'center' },
  card: {
    padding: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    gap: 8,
    minHeight: 280,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  article: { fontSize: 18, opacity: 0.6, fontStyle: 'italic', textAlign: 'center' },
  term: {
    fontSize: 32,
    fontWeight: '700',
    marginVertical: 4,
    textAlign: 'center',
    lineHeight: 40,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
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
  backFace: { gap: 4, marginTop: 16, alignItems: 'stretch' },
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
  flipHint: { textAlign: 'center', fontSize: 12, opacity: 0.45, marginTop: 4 },
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
