/**
 * Compact sync-status badge. Shows whether queued offline writes are still
 * waiting, syncing, or fully flushed. Tapping it forces a drain.
 */

import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useSync } from '@/lib/sync/SyncProvider';

export function SyncStatus() {
  const { pending, syncing, syncNow } = useSync();

  let label: string;
  let color: string;
  if (syncing) {
    label = 'Syncing…';
    color = '#a67d2a';
  } else if (pending > 0) {
    label = `${pending} pending`;
    color = '#a67d2a';
  } else {
    label = 'All synced';
    color = '#3a8a4f';
  }

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={syncNow}
      disabled={syncing}
      accessibilityRole="button"
      accessibilityLabel={`Sync status: ${label}. Tap to sync now.`}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText style={styles.label}>{label}</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 12, opacity: 0.7 },
});
