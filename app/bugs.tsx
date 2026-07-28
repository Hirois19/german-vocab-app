/**
 * "My bug reports" screen: read-only listing of every ticket the user has
 * filed plus its current status. Lets them confirm the report was received
 * and see when the dev (or Claude) has marked it fixed.
 */

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listMyBugReports } from '@/lib/db/bugReports';
import type { BugReportRow } from '@/lib/db/types';

const STATUS_COLOR: Record<BugReportRow['status'], string> = {
  open: '#888',
  reviewing: '#0a7ea4',
  fixing: '#a67d2a',
  fixed: '#3a8a4f',
  wontfix: '#a63a3a',
  duplicate: '#666',
};

function statusLabel(s: BugReportRow['status'], isJa: boolean): string {
  if (isJa) {
    return {
      open: '未対応',
      reviewing: '確認中',
      fixing: '修正中',
      fixed: '修正済み',
      wontfix: '対応しない',
      duplicate: '重複',
    }[s];
  }
  return {
    open: 'Open',
    reviewing: 'Reviewing',
    fixing: 'Fixing',
    fixed: 'Fixed',
    wontfix: "Won't fix",
    duplicate: 'Duplicate',
  }[s];
}

export default function BugsScreen() {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const isJa = i18n.language === 'ja';
  const [items, setItems] = useState<BugReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setItems(await listMyBugReports(user.id));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">{isJa ? 'バグ報告' : 'Bug reports'}</ThemedText>
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={styles.close}>{isJa ? '閉じる' : 'Close'}</ThemedText>
        </TouchableOpacity>
      </View>

      {items.length === 0 ? (
        <ThemedText style={styles.empty}>
          {isJa
            ? 'まだ報告はありません。気になることがあれば、画面右下の🐞ボタンから送信できます。'
            : 'No reports yet. Use the 🐞 button at the bottom right of any screen to file one.'}
        </ThemedText>
      ) : (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 32 + insets.bottom }]}>
          {items.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <ThemedText style={styles.date}>
                  {new Date(r.created_at).toLocaleString(isJa ? 'ja-JP' : 'en-GB')}
                </ThemedText>
                <View style={[styles.badge, { backgroundColor: STATUS_COLOR[r.status] }]}>
                  <ThemedText style={styles.badgeText}>{statusLabel(r.status, isJa)}</ThemedText>
                </View>
              </View>
              <ThemedText style={styles.desc}>{r.description}</ThemedText>
              {r.resolution_note ? (
                <ThemedText style={styles.note}>
                  {isJa ? '対応メモ: ' : 'Note: '}
                  {r.resolution_note}
                </ThemedText>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { color: '#0a7ea4', fontWeight: '600', paddingHorizontal: 12, paddingVertical: 8 },
  empty: { opacity: 0.6, fontSize: 14, lineHeight: 20, marginTop: 8 },
  list: { gap: 12, paddingBottom: 32 },
  card: {
    padding: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#666',
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { opacity: 0.6, fontSize: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  desc: { fontSize: 14, lineHeight: 20 },
  note: { fontSize: 13, opacity: 0.8, fontStyle: 'italic' },
});
