import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth/AuthProvider';
import { createMainDeck } from '@/lib/db/deckBuilder';
import type { CefrLevel, TriageMode } from '@/lib/seki/types';

const LEVEL_OPTIONS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1'];
const W_OPTIONS = [350, 700];
const TRIAGE_OPTIONS: { value: TriageMode; label: string; hint: string }[] = [
  { value: 'bulk', label: 'Bulk', hint: 'Triage all candidates before activation' },
  {
    value: 'progressive',
    label: 'Progressive',
    hint: 'Triage inline the first time a card appears',
  },
];

export default function NewDeckScreen() {
  const { user } = useAuth();
  const [selectedLevel, setSelectedLevel] = useState<CefrLevel>('B1');
  const [name, setName] = useState(`${selectedLevel} #1`);
  // Track whether the user has typed a custom name. Once they have, the level
  // chooser stops overwriting the field; otherwise picking A2 / B1 etc. swaps
  // the placeholder to match.
  const [nameEditedByUser, setNameEditedByUser] = useState(false);
  const [w, setW] = useState<number>(700);
  const [triageMode, setTriageMode] = useState<TriageMode>('bulk');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!nameEditedByUser) {
      setName(`${selectedLevel} #1`);
    }
  }, [selectedLevel, nameEditedByUser]);

  const valid = useMemo(() => name.trim().length > 0, [name]);

  const handleCreate = async () => {
    if (!user || !valid) return;
    setErrorMsg(null);
    setBusy(true);
    try {
      await createMainDeck({
        userId: user.id,
        name: name.trim(),
        levels: [selectedLevel],
        wordCountPerWeek: w,
        triageMode,
      });
      router.back();
    } catch (err) {
      const msg = (err as Error).message || 'Unknown error';
      setErrorMsg(msg);
      Alert.alert('Create failed', msg);
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">New deck</ThemedText>

      <View style={styles.section}>
        <ThemedText type="subtitle">Name</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="e.g. B1 #1, A1 core"
          placeholderTextColor="#888"
          value={name}
          onChangeText={(text) => {
            setName(text);
            setNameEditedByUser(true);
          }}
          editable={!busy}
        />
      </View>

      <View style={styles.section}>
        <ThemedText type="subtitle">Level</ThemedText>
        <ThemedText style={styles.hint}>Pick one CEFR level to draw from.</ThemedText>
        <View style={styles.chipRow}>
          {LEVEL_OPTIONS.map((lv) => {
            const selected = selectedLevel === lv;
            return (
              <TouchableOpacity
                key={lv}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setSelectedLevel(lv)}
                disabled={busy}
              >
                <ThemedText style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {lv}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <ThemedText type="subtitle">Triage mode</ThemedText>
        <ThemedText style={styles.hint}>
          How you mark already-known words: all at once before activation, or inline as each card
          first appears.
        </ThemedText>
        <View style={styles.chipRow}>
          {TRIAGE_OPTIONS.map((opt) => {
            const selected = triageMode === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setTriageMode(opt.value)}
                disabled={busy}
              >
                <ThemedText style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {opt.label}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>
        <ThemedText style={styles.hint}>
          {TRIAGE_OPTIONS.find((o) => o.value === triageMode)?.hint}
        </ThemedText>
      </View>

      <View style={styles.section}>
        <ThemedText type="subtitle">Words per 7 days (W)</ThemedText>
        <View style={styles.chipRow}>
          {W_OPTIONS.map((opt) => {
            const selected = w === opt;
            return (
              <TouchableOpacity
                key={opt}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setW(opt)}
                disabled={busy}
              >
                <ThemedText style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {opt}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>
        <ThemedText style={styles.hint}>
          Batch size = ceil(W / 7) = {Math.ceil(w / 7)} words per day.
        </ThemedText>
      </View>

      {errorMsg && (
        <View style={styles.errorBox}>
          <ThemedText style={styles.errorText}>Error: {errorMsg}</ThemedText>
        </View>
      )}

      <TouchableOpacity
        style={[styles.createButton, (!valid || busy) && styles.createButtonDisabled]}
        onPress={handleCreate}
        disabled={!valid || busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.createButtonText}>Create deck</ThemedText>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()} disabled={busy}>
        <ThemedText>Cancel</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  section: { gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    backgroundColor: '#1a1a1a',
  },
  hint: { opacity: 0.6, fontSize: 13 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#666',
  },
  chipSelected: { backgroundColor: '#0a7ea4', borderColor: '#0a7ea4' },
  chipText: { fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  createButton: {
    backgroundColor: '#0a7ea4',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  createButtonDisabled: { opacity: 0.4 },
  createButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelButton: { padding: 12, alignItems: 'center' },
  errorBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#a63a3a',
    backgroundColor: '#3a1010',
  },
  errorText: { color: '#fff', fontSize: 13 },
});
