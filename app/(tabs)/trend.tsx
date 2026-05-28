import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import { LineChart } from '@/components/charts/line-chart';
import { StackedBarChart } from '@/components/charts/stacked-bar-chart';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listAllReviews } from '@/lib/db/reviews';
import type { ReviewRow } from '@/lib/db/types';
import { useUserChanges } from '@/lib/realtime/useUserChanges';
import { aggregateByMonthsBucket, aggregateByWeek } from '@/lib/stats/aggregate';

type Granularity = 'week' | 'month' | '3month' | '6month' | 'year';

interface GranularityConfig {
  label: string;
  recentN: number;
  labelOf: (periodStart: string) => string;
}

const GRANULARITY_OPTIONS: { key: Granularity; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: '3month', label: '3M' },
  { key: '6month', label: '6M' },
  { key: 'year', label: '1Y' },
];

const CONFIGS: Record<Granularity, GranularityConfig> = {
  week: { label: 'week', recentN: 12, labelOf: (d) => d.slice(5) },
  month: { label: 'month', recentN: 12, labelOf: (d) => d.slice(2, 7) },
  '3month': { label: '3-month bucket', recentN: 8, labelOf: (d) => d.slice(2, 7) },
  '6month': { label: '6-month bucket', recentN: 6, labelOf: (d) => d.slice(2, 7) },
  year: { label: 'year', recentN: 5, labelOf: (d) => d.slice(0, 4) },
};

export default function TrendScreen() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [granularity, setGranularity] = useState<Granularity>('week');
  const [reviews, setReviews] = useState<ReviewRow[]>([]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const r = await listAllReviews(user.id);
      setReviews(r);
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

  const series = useMemo(() => {
    switch (granularity) {
      case 'week':
        return aggregateByWeek(reviews);
      case 'month':
        return aggregateByMonthsBucket(reviews, 1);
      case '3month':
        return aggregateByMonthsBucket(reviews, 3);
      case '6month':
        return aggregateByMonthsBucket(reviews, 6);
      case 'year':
        return aggregateByMonthsBucket(reviews, 12);
    }
  }, [granularity, reviews]);

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
        <ThemedText type="title">Trend</ThemedText>
        <ThemedText style={styles.muted}>
          Review some cards to see your study volume over time.
        </ThemedText>
      </ThemedView>
    );
  }

  const config = CONFIGS[granularity];
  const chartWidth = Math.min(width - 64, 360);
  const recent = series.slice(-config.recentN);
  const barData = recent.map((p) => ({
    label: config.labelOf(p.periodStart),
    bottom: p.reviewCount,
    top: 0,
  }));
  const yesRateData = recent.map((p) => ({
    label: config.labelOf(p.periodStart),
    value: Math.round(p.yesRate * 100),
  }));
  const totalReviews = reviews.length;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Trend</ThemedText>
      </View>

      <View style={styles.toggleRow}>
        {GRANULARITY_OPTIONS.map((opt) => (
          <ToggleButton
            key={opt.key}
            label={opt.label}
            active={granularity === opt.key}
            onPress={() => setGranularity(opt.key)}
          />
        ))}
      </View>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">
          Review volume (last {config.recentN} {config.label}s)
        </ThemedText>
        <View style={styles.chartContainer}>
          <StackedBarChart data={barData} height={180} bottomColor="#0a7ea4" />
        </View>
        <ThemedText style={styles.muted}>Total reviews so far: {totalReviews}</ThemedText>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">YES rate trend (%)</ThemedText>
        <View style={styles.chartContainer}>
          <LineChart
            data={yesRateData}
            width={chartWidth}
            height={180}
            emptyMessage="Need at least one review to plot the YES rate."
          />
        </View>
      </ThemedView>
    </ScrollView>
  );
}

function ToggleButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.toggleButton, active && styles.toggleButtonActive]}
      onPress={onPress}
    >
      <ThemedText style={[styles.toggleText, active && styles.toggleTextActive]}>
        {label}
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleRow: { flexDirection: 'row', gap: 0 },
  toggleButton: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#666',
    alignItems: 'center',
  },
  toggleButtonActive: { backgroundColor: '#0a7ea4', borderColor: '#0a7ea4' },
  toggleText: { fontWeight: '600' },
  toggleTextActive: { color: '#fff' },
  muted: { opacity: 0.6 },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    gap: 8,
  },
  chartContainer: { marginVertical: 8, alignItems: 'center' },
});
