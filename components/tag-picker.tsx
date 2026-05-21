/**
 * Tag picker for a single user_card.
 *
 * Source of truth: `user_cards.tags` (text[] column, added in migration 0007).
 * - Initial value comes from `cards.categories` (source-data themes/POS/level)
 *   copied at deck creation time.
 * - User can toggle any tag in the picker; we write the full array back.
 *
 * Available tags shown in the picker are the union of all `cards.categories`
 * values across the dictionary (see `listAvailableTags`).
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { AvailableTag } from '@/lib/db/cards';
import { listAvailableTags } from '@/lib/db/cards';
import { queuedSetUserCardTags } from '@/lib/sync/queuedWrites';

interface Props {
  visible: boolean;
  userCardId: string | null;
  /** Current tags on the user_card. The picker initializes selection from this. */
  currentTags: string[];
  /** Called after a successful save so the parent can reflect the new tags on the card UI. */
  onTagsChanged: (tags: string[]) => void;
  onClose: () => void;
}

const SECTION_LABEL: Record<AvailableTag['kind'], string> = {
  theme: 'Themes',
  pos: 'Parts of speech',
  level: 'CEFR level',
};

export function TagPicker({ visible, userCardId, currentTags, onTagsChanged, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState<AvailableTag[]>([]);
  const [active, setActive] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Load the available tag list once when the picker first opens.
  useEffect(() => {
    if (!visible) return;
    if (available.length > 0) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const tags = await listAvailableTags();
        if (!cancelled) setAvailable(tags);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, available.length]);

  // Sync local selection state to props every time the picker is shown
  // (different cards have different starting tag sets).
  useEffect(() => {
    if (visible) {
      setActive(new Set(currentTags));
    }
  }, [visible, currentTags]);

  const toggle = async (tagName: string) => {
    if (!userCardId || busy) return;
    const next = new Set(active);
    if (next.has(tagName)) next.delete(tagName);
    else next.add(tagName);
    const nextArr = Array.from(next);
    // Optimistic local update; rollback on failure.
    setActive(next);
    setBusy(true);
    try {
      const updatedTags = await queuedSetUserCardTags(userCardId, nextArr);
      onTagsChanged(updatedTags);
    } catch {
      // Roll back the optimistic update on failure.
      setActive(new Set(active));
    } finally {
      setBusy(false);
    }
  };

  // Surface any tags the user has on the card but that aren't in `available`
  // (e.g. legacy free-form tags) so they remain visible and removable.
  const extras = Array.from(active).filter((t) => !available.some((a) => a.name === t));
  const sections: { kind: AvailableTag['kind'] | 'extra'; items: string[] }[] = [
    { kind: 'theme', items: available.filter((a) => a.kind === 'theme').map((a) => a.name) },
    { kind: 'pos', items: available.filter((a) => a.kind === 'pos').map((a) => a.name) },
    { kind: 'level', items: available.filter((a) => a.kind === 'level').map((a) => a.name) },
  ];
  if (extras.length > 0) sections.push({ kind: 'extra', items: extras });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView style={styles.sheet}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Tags for this card</ThemedText>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <ThemedText style={styles.closeButtonText}>Done</ThemedText>
            </TouchableOpacity>
          </View>
          {loading && available.length === 0 ? (
            <ActivityIndicator style={{ marginVertical: 24 }} />
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {sections.map((sec) => {
                if (sec.items.length === 0) return null;
                const label = sec.kind === 'extra' ? 'Other' : SECTION_LABEL[sec.kind];
                return (
                  <View key={sec.kind} style={styles.section}>
                    <ThemedText style={styles.sectionLabel}>{label}</ThemedText>
                    <View style={styles.chipsWrap}>
                      {sec.items.map((name) => {
                        const on = active.has(name);
                        return (
                          <TouchableOpacity
                            key={name}
                            style={[styles.chip, on && styles.chipOn, busy && styles.disabled]}
                            onPress={() => toggle(name)}
                            disabled={busy}
                          >
                            <ThemedText style={[styles.chipText, on && styles.chipTextOn]}>
                              {on ? '✓ ' : ''}
                              {name}
                            </ThemedText>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
    paddingBottom: 32,
    maxHeight: '75%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  closeButton: { paddingHorizontal: 12, paddingVertical: 6 },
  closeButtonText: { color: '#0a7ea4', fontWeight: '700' },
  scroll: { flexGrow: 0 },
  scrollContent: { gap: 16, paddingBottom: 16 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '700', opacity: 0.6, textTransform: 'uppercase' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#666',
  },
  chipOn: { backgroundColor: '#0a7ea4', borderColor: '#0a7ea4' },
  chipText: { fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  disabled: { opacity: 0.5 },
});
