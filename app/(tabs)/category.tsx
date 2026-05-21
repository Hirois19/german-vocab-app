import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet } from 'react-native';

import { HorizontalBarChart } from '@/components/charts/horizontal-bar-chart';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listCardsByIds } from '@/lib/db/cards';
import { listAllReviews } from '@/lib/db/reviews';
import type { CardRow, ReviewRow, UserCardRow } from '@/lib/db/types';
import { listAllByUser } from '@/lib/db/userCards';
import { useUserChanges } from '@/lib/realtime/useUserChanges';
import { aggregateByArticle, aggregateByPos } from '@/lib/stats/aggregate';

export default function CategoryScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [userCards, setUserCards] = useState<UserCardRow[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [r, uc] = await Promise.all([listAllReviews(user.id), listAllByUser(user.id)]);
      setReviews(r);
      setUserCards(uc);
      const cardIds = Array.from(new Set(uc.map((u) => u.card_id)));
      const c = await listCardsByIds(cardIds);
      setCards(c);
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

  if (reviews.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title">By category</ThemedText>
        <ThemedText style={styles.muted}>
          Review some cards first. Once you have rated reviews, YES rates break down by part of
          speech and noun article here.
        </ThemedText>
      </ThemedView>
    );
  }

  const posAgg = aggregateByPos(reviews, userCards, cards).map((a) => ({
    label: a.category,
    value: a.yesRate,
    hint: `${a.total} reviews`,
  }));
  const articleAgg = aggregateByArticle(reviews, userCards, cards).map((a) => ({
    label: a.category,
    value: a.yesRate,
    hint: `${a.total} reviews`,
  }));

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">By category</ThemedText>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">YES rate by part of speech</ThemedText>
        <HorizontalBarChart data={posAgg} />
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">YES rate by article (der/die/das)</ThemedText>
        <ThemedText style={styles.hint}>
          Nouns only. Useful for spotting which gender you guess wrong most often.
        </ThemedText>
        <HorizontalBarChart data={articleAgg} barColor="#a67d2a" />
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  muted: { opacity: 0.6 },
  hint: { fontSize: 12, opacity: 0.6 },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    gap: 10,
  },
});
