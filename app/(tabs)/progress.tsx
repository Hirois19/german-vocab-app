import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { LevelProgressBar } from '@/components/charts/level-progress-bar';
import { StackedBarChart } from '@/components/charts/stacked-bar-chart';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listCardsByIdsCached } from '@/lib/cache/cardsCache';
import { countCardsByLevel } from '@/lib/db/cards';
import { getActiveDeck } from '@/lib/db/decks';
import { listReviewsForDeck } from '@/lib/db/reviews';
import type { DeckRow, ReviewRow } from '@/lib/db/types';
import { listAllByUser } from '@/lib/db/userCards';
import { useUserChanges } from '@/lib/realtime/useUserChanges';
import {
  aggregateByCycle,
  aggregateLevelProgress,
  type LevelProgress,
} from '@/lib/stats/aggregate';
import type { CefrLevel } from '@/lib/seki/types';

export default function ProgressScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [deck, setDeck] = useState<DeckRow | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [levelProgress, setLevelProgress] = useState<LevelProgress[]>([]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Active deck + its reviews (per-cycle chart).
      const d = await getActiveDeck(user.id);
      setDeck(d);
      setReviews(d ? await listReviewsForDeck(d.id, user.id) : []);

      // Per-level dictionary coverage (independent of the active deck).
      const [levelTotals, userCards] = await Promise.all([
        countCardsByLevel(),
        listAllByUser(user.id),
      ]);
      const distinctCardIds = Array.from(new Set(userCards.map((uc) => uc.card_id)));
      const cards = await listCardsByIdsCached(distinctCardIds);
      const cardLevel = new Map<string, CefrLevel>();
      for (const c of cards) {
        const lv = c.levels[0];
        if (lv) cardLevel.set(c.id, lv);
      }
      setLevelProgress(aggregateLevelProgress(userCards, cardLevel, levelTotals));
    } catch (err) {
      Alert.alert('Load failed', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useUserChanges(user?.id ?? null, refresh);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const cycleAgg = aggregateByCycle(reviews);
  const chartData = cycleAgg.map((c) => ({ label: `C${c.cycle}`, bottom: c.yes, top: c.half }));
  const totalYes = cycleAgg.reduce((s, c) => s + c.yes, 0);
  const totalHalf = cycleAgg.reduce((s, c) => s + c.half, 0);
  const totalNo = cycleAgg.reduce((s, c) => s + c.no, 0);
  const totalAll = totalYes + totalHalf + totalNo;
  const yesRate = totalAll === 0 ? 0 : Math.round((totalYes / totalAll) * 100);
  const halfRate = totalAll === 0 ? 0 : Math.round((totalHalf / totalAll) * 100);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Progress</ThemedText>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Coverage by level</ThemedText>
        <ThemedText style={styles.hint}>
          Green = learned (mastered or pre-known). Blue = currently studying. The rest of each bar
          is vocabulary you have not reached yet.
        </ThemedText>
        <View style={styles.chartContainer}>
          <LevelProgressBar
            data={levelProgress.map((lp) => ({
              label: lp.level,
              total: lp.total,
              known: lp.known,
              studying: lp.studying,
            }))}
          />
        </View>
      </ThemedView>

      {deck ? (
        <>
          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">{deck.name}</ThemedText>
            <ThemedText style={styles.muted}>
              Day {deck.current_day}/49 · W={deck.word_count_per_week}
            </ThemedText>
            <ThemedText style={styles.hint}>
              Green = YES (fully knew). Yellow = HALF (inferred meaning). Bars grow as the cycle
              fills in.
            </ThemedText>
            <View style={styles.chartContainer}>
              <StackedBarChart data={chartData} maxValue={deck.word_count_per_week} height={200} />
            </View>
            <View style={styles.legendRow}>
              <Legend color="#3a8a4f" label={`YES ${totalYes}`} />
              <Legend color="#a67d2a" label={`HALF ${totalHalf}`} />
              <Legend color="#666" label={`NO ${totalNo}`} />
            </View>
          </ThemedView>

          <ThemedView style={styles.card}>
            <ThemedText type="subtitle">Rates so far</ThemedText>
            <ThemedText>
              YES rate: <ThemedText style={styles.strong}>{yesRate}%</ThemedText>
            </ThemedText>
            <ThemedText>
              HALF rate: <ThemedText style={styles.strong}>{halfRate}%</ThemedText>
            </ThemedText>
            <ThemedText style={styles.muted}>Total reviews: {totalAll}</ThemedText>
          </ThemedView>
        </>
      ) : (
        <ThemedText style={styles.muted}>
          Activate a deck to see your cycle-by-cycle progress here.
        </ThemedText>
      )}
    </ScrollView>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <ThemedText style={styles.legendText}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  muted: { opacity: 0.6 },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    gap: 8,
  },
  hint: { fontSize: 12, opacity: 0.6 },
  chartContainer: { marginVertical: 8 },
  legendRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 13 },
  strong: { fontWeight: '700' },
});
