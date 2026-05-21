import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export interface HorizontalBarDatum {
  label: string;
  /** A 0..1 value for proportional fill (e.g., YES rate). */
  value: number;
  /** Optional secondary text shown after the label (e.g., sample size). */
  hint?: string;
}

interface Props {
  data: HorizontalBarDatum[];
  barColor?: string;
}

export function HorizontalBarChart({ data, barColor = '#0a7ea4' }: Props) {
  if (data.length === 0) {
    return <ThemedText style={styles.empty}>No data yet.</ThemedText>;
  }
  return (
    <View style={styles.container}>
      {data.map((d, i) => {
        const pct = Math.max(0, Math.min(1, d.value));
        return (
          <View key={i} style={styles.row}>
            <View style={styles.labelCol}>
              <ThemedText style={styles.label}>{d.label}</ThemedText>
              {d.hint && <ThemedText style={styles.hint}>{d.hint}</ThemedText>}
            </View>
            <View style={styles.barCol}>
              <View style={styles.track}>
                <View
                  style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: barColor }]}
                />
              </View>
              <ThemedText style={styles.value}>{Math.round(pct * 100)}%</ThemedText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  labelCol: { width: 90 },
  label: { fontWeight: '600' },
  hint: { fontSize: 11, opacity: 0.6 },
  barCol: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3a3a3a',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 6 },
  value: { width: 44, textAlign: 'right', fontVariant: ['tabular-nums'] },
  empty: { opacity: 0.6, fontStyle: 'italic' },
});
