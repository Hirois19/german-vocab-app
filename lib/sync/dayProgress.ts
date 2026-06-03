/**
 * Local, offline-first record of what the user did in a deck's day.
 *
 * Session resume (`app/decks/[id]/session.tsx`) needs to know which cards in
 * today's batch the user has already acted on, so an interrupted session
 * continues at the next pending card instead of restarting at card 1. The
 * server `reviews` table is the durable source of truth, but it is unreachable
 * offline and lags behind writes still sitting in the outbox. This
 * per-(deck, day) cache is written on every triage / rating the moment it
 * happens — online or offline — so resume works with no connectivity and
 * reflects writes that have not been synced yet.
 *
 * Storage mirrors the outbox / session-snapshot pattern: one AsyncStorage key
 * per (deck, day) holding a small JSON blob. Keys are namespaced and versioned
 * so a future format change can be migrated by bumping the version.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TriageStatus } from '../seki/types';

const KEY_PREFIX = 'german-vocab-app:day-progress:v1:';

export interface DayProgress {
  /** user_card_ids that have a rating recorded for this day. */
  rated: string[];
  /** user_card_id -> the triage decision the user made for it this day. */
  triaged: Record<string, TriageStatus>;
}

function emptyProgress(): DayProgress {
  return { rated: [], triaged: {} };
}

function keyFor(deckId: string, day: number): string {
  return `${KEY_PREFIX}${deckId}:${day}`;
}

// Serialize read-modify-write so a fast tapper rating several cards in quick
// succession cannot clobber the stored blob (same approach as the outbox).
let lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = lock.then(fn, fn);
  lock = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function read(deckId: string, day: number): Promise<DayProgress> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(deckId, day));
    if (!raw) return emptyProgress();
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Partial<DayProgress>;
      return {
        rated: Array.isArray(p.rated) ? p.rated : [],
        triaged: p.triaged && typeof p.triaged === 'object' ? p.triaged : {},
      };
    }
    return emptyProgress();
  } catch {
    return emptyProgress();
  }
}

/** Read this device's recorded actions for a (deck, day). Never throws. */
export function loadDayProgress(deckId: string, day: number): Promise<DayProgress> {
  return read(deckId, day);
}

/** Mark a card as rated for the day. A cache failure never breaks the rating. */
export function recordRated(deckId: string, day: number, userCardId: string): Promise<void> {
  return withLock(async () => {
    const cur = await read(deckId, day);
    if (!cur.rated.includes(userCardId)) cur.rated.push(userCardId);
    try {
      await AsyncStorage.setItem(keyFor(deckId, day), JSON.stringify(cur));
    } catch {
      // Best-effort: a successful rating must not fail because the cache write did.
    }
  });
}

/** Record a triage decision for the day so resume can skip already-known cards. */
export function recordTriage(
  deckId: string,
  day: number,
  userCardId: string,
  status: TriageStatus,
): Promise<void> {
  return withLock(async () => {
    const cur = await read(deckId, day);
    cur.triaged[userCardId] = status;
    try {
      await AsyncStorage.setItem(keyFor(deckId, day), JSON.stringify(cur));
    } catch {
      // Best-effort, as above.
    }
  });
}
