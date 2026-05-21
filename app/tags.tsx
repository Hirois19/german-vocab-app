/**
 * Tag reference screen.
 *
 * Tags are not a separate user-owned namespace anymore. They come from the
 * source data (cards.categories: themes / POS / CEFR level) and are stored
 * per-card on `user_cards.tags`. Editing happens inline in the session tag
 * picker. This screen is a read-only overview: every available tag, grouped
 * by kind, with how many cards across the user's decks currently carry it.
 */

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';
import { listAvailableTags, type AvailableTag } from '@/lib/db/cards';
import { listAllByUser } from '@/lib/db/userCards';

interface TagWithCount extends AvailableTag {
  count: number;
}

const SECTION_LABEL: Record<AvailableTag['kind'], string> = {
  theme: 'Themes',
  pos: 'Parts of speech',
  level: 'CEFR level',
};

export default function TagsScreen() {
  const { user } = useAuth();
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [available, userCards] = await Promise.all([
        listAvailableTags(),
        listAllByUser(user.id),
      ]);
      // Count how many of the user's cards carry each tag.
      const counts = new Map<string, number>();
      for (const uc of userCards) {
        for (const tag of uc.tags ?? []) {
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }
      setTags(available.map((t) => ({ ...t, count: counts.get(t.name) ?? 0 })));
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

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const sections: { kind: AvailableTag['kind']; items: TagWithCount[] }[] = [
    { kind: 'theme', items: tags.filter((t) => t.kind === 'theme') },
    { kind: 'pos', items: tags.filter((t) => t.kind === 'pos') },
    { kind: 'level', items: tags.filter((t) => t.kind === 'level') },
  ];

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Tags</ThemedText>
        <ThemedText style={styles.closeButton} onPress={() => router.back()}>
          Close
        </ThemedText>
      </View>

      <ThemedText style={styles.hint}>
        Tags come from the vocabulary source data (theme, part of speech, CEFR level) and are
        attached to every card automatically. To add or remove a tag on a specific card, use the Tag
        button during a review session. The numbers below show how many of your cards carry each
        tag.
      </ThemedText>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {sections.map((sec) => {
          if (sec.items.length === 0) return null;
          return (
            <View key={sec.kind} style={styles.section}>
              <ThemedText style={styles.sectionLabel}>{SECTION_LABEL[sec.kind]}</ThemedText>
              <View style={styles.chipsWrap}>
                {sec.items.map((t) => (
                  <View key={t.name} style={[styles.chip, t.count === 0 && styles.chipUnused]}>
                    <ThemedText style={styles.chipName}>{t.name}</ThemedText>
                    <View style={styles.countBadge}>
                      <ThemedText style={styles.countText}>{t.count}</ThemedText>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  closeButton: { color: '#0a7ea4', fontWeight: '600', paddingHorizontal: 12, paddingVertical: 8 },
  hint: { fontSize: 12, opacity: 0.6, lineHeight: 18 },
  scrollContent: { gap: 20, paddingBottom: 32 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '700', opacity: 0.6, textTransform: 'uppercase' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#0a7ea4',
  },
  chipUnused: { borderColor: '#666', opacity: 0.5 },
  chipName: { fontWeight: '600' },
  countBadge: {
    minWidth: 24,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#0a7ea4',
    alignItems: 'center',
  },
  countText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
