import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export interface StackedBarData {
  label: string;
  /** Bottom (typically green) segment. */
  bottom: number;
  /** Top (typically yellow) segment. */
  top: number;
}

interface Props {
  data: StackedBarData[];
  /** Y-axis max for normalising bar heights. Defaults to max(bottom+top) across data. */
  maxValue?: number;
  height?: number;
  bottomColor?: string;
  topColor?: string;
}

export function StackedBarChart({
  data,
  maxValue,
  height = 180,
  bottomColor = '#3a8a4f',
  topColor = '#a67d2a',
}: Props) {
  const ymax = maxValue ?? Math.max(1, ...data.map((d) => d.bottom + d.top));
  return (
    <View style={[styles.container, { height }]}>
      {data.map((d, i) => {
        const totalRatio = (d.bottom + d.top) / ymax;
        const bottomRatio = d.bottom / ymax;
        const topRatio = d.top / ymax;
        const totalH = totalRatio * (height - 24);
        const bottomH = bottomRatio * (height - 24);
        const topH = topRatio * (height - 24);
        return (
          <View key={i} style={styles.column}>
            <View style={styles.barColumn}>
              <View style={{ height: height - 24 - totalH }} />
              {topH > 0 && (
                <View style={[styles.barSegment, { height: topH, backgroundColor: topColor }]} />
              )}
              {bottomH > 0 && (
                <View
                  style={[styles.barSegment, { height: bottomH, backgroundColor: bottomColor }]}
                />
              )}
            </View>
            <ThemedText style={styles.label}>{d.label}</ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  column: { flex: 1, alignItems: 'center', height: '100%' },
  barColumn: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  barSegment: { width: '100%' },
  label: { fontSize: 12, marginTop: 4, opacity: 0.7 },
});
