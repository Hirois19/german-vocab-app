import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import { SyncStatus } from '@/components/sync-status';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';
import { countCards } from '@/lib/db/cards';
import { getActiveDeck } from '@/lib/db/decks';
import type { DeckRow } from '@/lib/db/types';
import { useUserChanges } from '@/lib/realtime/useUserChanges';
import { batchAssignmentForDay } from '@/lib/seki/scheduler';

export default function TodayScreen() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cardCount, setCardCount] = useState<number | null>(null);
  const [activeDeck, setActiveDeck] = useState<DeckRow | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [count, deck] = await Promise.all([countCards(), getActiveDeck(user.id)]);
      setCardCount(count);
      setActiveDeck(deck);
    } catch (err) {
      Alert.alert('Load error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Auto-refresh when remote changes arrive (another device finishes a session, etc.).
  useUserChanges(user?.id ?? null, refresh);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  const assignment = activeDeck
    ? batchAssignmentForDay(activeDeck.current_day, activeDeck.word_count_per_week, 0)
    : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <ThemedText type="title">{t('dashboard.tabToday')}</ThemedText>
        <SyncStatus />
      </View>

      <TouchableOpacity style={styles.guideCard} onPress={() => router.push('/how-it-works')}>
        <View style={styles.guideText}>
          <ThemedText type="subtitle">{t('guide.cardTitle')}</ThemedText>
          <ThemedText style={styles.muted}>{t('guide.cardSubtitle')}</ThemedText>
        </View>
        <ThemedText style={styles.chevron}>›</ThemedText>
      </TouchableOpacity>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Vocabulary in DB</ThemedText>
        <ThemedText style={styles.bigNumber}>{cardCount ?? '—'}</ThemedText>
        <ThemedText style={styles.muted}>shared dictionary entries</ThemedText>
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Active deck</ThemedText>
        {activeDeck && assignment ? (
          <>
            <ThemedText style={styles.deckName}>{activeDeck.name}</ThemedText>
            <ThemedText>
              {t('deck.dayProgress', {
                day: assignment.day,
                cycle: assignment.cycle,
                batch: assignment.batch,
              })}
            </ThemedText>
            <ThemedText style={styles.muted}>W = {activeDeck.word_count_per_week}</ThemedText>
            <TouchableOpacity
              style={styles.sessionButton}
              onPress={() =>
                router.push({
                  pathname: '/decks/[id]/session',
                  params: { id: activeDeck.id },
                })
              }
            >
              <ThemedText style={styles.sessionButtonText}>Start today&apos;s session</ThemedText>
            </TouchableOpacity>
          </>
        ) : (
          <ThemedText style={styles.muted}>
            No active deck yet. Go to the &quot;Decks&quot; tab to create one.
          </ThemedText>
        )}
      </ThemedView>

      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Signed in as</ThemedText>
        <ThemedText style={styles.muted}>{user?.email}</ThemedText>
        <TouchableOpacity onPress={signOut} style={styles.signOutButton}>
          <ThemedText style={styles.signOutText}>Sign out</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, paddingBottom: 32 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  guideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#0a7ea4',
  },
  guideText: { flex: 1, gap: 2 },
  chevron: { fontSize: 24, opacity: 0.5 },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    gap: 4,
  },
  bigNumber: { fontSize: 36, fontWeight: '700' },
  deckName: { fontSize: 18, fontWeight: '600' },
  muted: { opacity: 0.6 },
  signOutButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#cc4444',
    alignSelf: 'flex-start',
  },
  signOutText: { color: '#fff', fontWeight: '600' },
  sessionButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#0a7ea4',
    alignItems: 'center',
  },
  sessionButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
