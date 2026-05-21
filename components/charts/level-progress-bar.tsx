import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export interface LevelProgressDatum {
  /** Row label, e.g. the CEFR level "A1". */
  label: string;
  /** Total cards at this level. */
  total: number;
  /** Cards learned (mastered or pre-known). Drawn as the green segment. */
  known: number;
  /** Cards currently being studied. Drawn as the blue segment after `known`. */
  studying: number;
}

interface Props {
  data: LevelProgressDatum[];
}

const KNOWN_COLOR = '#3a8a4f';
const STUDYING_COLOR = '#0a7ea4';

/**
 * Per-level dictionary coverage. Each row is a stacked horizontal bar:
 * green = learned, blue = in progress, the remaining track = not yet reached.
 */
export function LevelProgressBar({ data }: Props) {
  if (data.length === 0) {
    return <ThemedText style={styles.empty}>No data yet.</ThemedText>;
  }
  return (
    <View style={styles.container}>
      {data.map((d) => {
        const total = Math.max(1, d.total);
        const knownPct = Math.max(0, Math.min(1, d.known / total));
        const studyingPct = Math.max(0, Math.min(1 - knownPct, d.studying / total));
        const donePct = Math.round((d.known / total) * 100);
        return (
          <View key={d.label} style={styles.row}>
            <View style={styles.header}>
              <ThemedText style={styles.label}>{d.label}</ThemedText>
              <ThemedText style={styles.count}>
                {d.known} / {d.total}
                {d.studying > 0 ? `  (+${d.studying} studying)` : ''}
              </ThemedText>
              <ThemedText style={styles.pct}>{donePct}%</ThemedText>
            </View>
            <View style={styles.track}>
              <View
                style={[styles.seg, { width: `${knownPct * 100}%`, backgroundColor: KNOWN_COLOR }]}
              />
              <View
                style={[
                  styles.seg,
                  { width: `${studyingPct * 100}%`, backgroundColor: STUDYING_COLOR },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  row: { gap: 4 },
  header: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  label: { fontWeight: '700', width: 32 },
  count: { flex: 1, fontSize: 12, opacity: 0.7, fontVariant: ['tabular-nums'] },
  pct: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  track: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3a3a3a',
    overflow: 'hidden',
  },
  seg: { height: '100%' },
  empty: { opacity: 0.6, fontStyle: 'italic' },
});
