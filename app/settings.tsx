/**
 * Settings modal. Currently scoped to the audio-repeat preference; this is
 * also the home for any future user-tunable knob (weak-threshold, default W,
 * etc.). Each setting is loaded from `user_settings` on mount and persisted
 * back through the same row.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getOrCreate, update } from '@/lib/db/userSettings';
import { notify } from '@/lib/ui/notify';

export default function SettingsScreen() {
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const isJa = i18n.language === 'ja';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [audioRepeatCount, setAudioRepeatCount] = useState<1 | 2>(1);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const s = await getOrCreate(user.id);
        setAudioRepeatCount(s.audio_repeat_count ?? 1);
      } catch (err) {
        notify('Load failed', (err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const saveAudioRepeat = async (next: 1 | 2) => {
    if (!user || saving || next === audioRepeatCount) return;
    const previous = audioRepeatCount;
    setAudioRepeatCount(next);
    setSaving(true);
    try {
      await update(user.id, { audioRepeatCount: next });
    } catch (err) {
      setAudioRepeatCount(previous);
      notify('Save failed', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

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
        <ThemedText type="title">{isJa ? '設定' : 'Settings'}</ThemedText>
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={styles.close}>{isJa ? '閉じる' : 'Close'}</ThemedText>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}>
        <View style={styles.row}>
          <ThemedText type="subtitle">
            {isJa ? 'カードめくり時の自動読み上げ回数' : 'Auto-speak on reveal'}
          </ThemedText>
          <ThemedText style={styles.hint}>
            {isJa
              ? 'セッション中、カードをめくると単語が自動で読み上げられます。何回繰り返すかを選べます。'
              : 'When you reveal a card during a session the word is read aloud. Choose how many times to repeat it.'}
          </ThemedText>
          <View style={styles.chipRow}>
            {[1, 2].map((n) => {
              const selected = audioRepeatCount === n;
              return (
                <TouchableOpacity
                  key={n}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => void saveAudioRepeat(n as 1 | 2)}
                  disabled={saving}
                >
                  <ThemedText style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {isJa ? `${n} 回` : `${n}x`}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/bugs')}>
          <ThemedText type="subtitle">{isJa ? 'バグ報告の履歴' : 'My bug reports'}</ThemedText>
          <ThemedText style={styles.linkArrow}>›</ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { color: '#0a7ea4', fontWeight: '600', paddingHorizontal: 12, paddingVertical: 8 },
  scroll: { gap: 20, paddingBottom: 32 },
  row: { gap: 10 },
  hint: { opacity: 0.6, fontSize: 13, lineHeight: 18 },
  chipRow: { flexDirection: 'row', gap: 10 },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#666',
  },
  chipSelected: { backgroundColor: '#0a7ea4', borderColor: '#0a7ea4' },
  chipText: { fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#444',
  },
  linkArrow: { fontSize: 22, opacity: 0.5 },
});
