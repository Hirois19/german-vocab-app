import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View, useWindowDimensions } from 'react-native';

import { LineChart } from '@/components/charts/line-chart';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listAllByUser } from '@/lib/db/userCards';
import type { UserCardRow } from '@/lib/db/types';
import { useUserChanges } from '@/lib/realtime/useUserChanges';
import { aggregateMasteredOverTime } from '@/lib/stats/aggregate';

export default function MasteredScreen() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [userCards, setUserCards] = useState<UserCardRow[]>([]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const uc = await listAllByUser(user.id);
      setUserCards(uc);
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

  const series = aggregateMasteredOverTime(userCards);
  const masteredTotal = userCards.filter((c) => c.is_mastered).length;
  const preKnownTotal = userCards.filter(
    (c) => c.triage_status === 'known' || c.triage_status === 'known_fully',
  ).length;
  const linePoints = series.map((p) => ({ label: p.date.slice(5), value: p.cumulative }));
  const chartWidth = Math.min(width - 64, 360);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Mastered</ThemedText>

      <View style={styles.statsRow}>
        <StatCard label="Mastered" value={masteredTotal} />
        <StatCard label="Pre-known" value={preKnownTotal} />
      </View>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Cumulative trend</ThemedText>
        <ThemedText style={styles.hint}>
          Words confirmed mastered (passed a full 49-day SEKI cycle without the weak flag).
        </ThemedText>
        <View style={styles.chartContainer}>
          <LineChart
            data={linePoints}
            width={chartWidth}
            height={200}
            emptyMessage="No mastered words yet. Complete a 49-day cycle to start the curve."
          />
        </View>
      </ThemedView>
    </ThemedView>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <ThemedView style={styles.statCard}>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    alignItems: 'center',
    gap: 4,
  },
  statLabel: { opacity: 0.6, fontSize: 13 },
  statValue: { fontSize: 28, fontWeight: '700' },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    gap: 8,
  },
  hint: { fontSize: 12, opacity: 0.6 },
  chartContainer: { marginVertical: 8, alignItems: 'center' },
});
