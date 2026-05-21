/**
 * Read-side cache so a review session can be started while fully offline.
 *
 * After a session screen successfully loads its data online, it snapshots the
 * deck row and the deck's non-excluded user_cards here. If a later load fails
 * because the device is offline, the session falls back to this snapshot. The
 * shared `cards` dictionary is already cached separately (see `cardsCache`).
 *
 * The snapshot can go stale if the user runs several sessions while offline;
 * that is acceptable — the outbox still records every write, so the server
 * becomes correct once connectivity returns and the next online load refreshes
 * the snapshot.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DeckRow, UserCardRow } from '../db/types';

const KEY_PREFIX = 'german-vocab-app:session-snapshot:v1:';

export interface SessionSnapshot {
  deck: DeckRow;
  userCards: UserCardRow[];
  savedAt: string;
}

export async function saveSessionSnapshot(
  deckId: string,
  data: { deck: DeckRow; userCards: UserCardRow[] },
): Promise<void> {
  const snapshot: SessionSnapshot = { ...data, savedAt: new Date().toISOString() };
  try {
    await AsyncStorage.setItem(KEY_PREFIX + deckId, JSON.stringify(snapshot));
  } catch {
    // A cache write failure must never break the (successful) online load.
  }
}

export async function loadSessionSnapshot(deckId: string): Promise<SessionSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + deckId);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'deck' in parsed && 'userCards' in parsed) {
      return parsed as SessionSnapshot;
    }
    return null;
  } catch {
    return null;
  }
}
