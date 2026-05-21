/**
 * Queue-aware wrappers around the user-data write repositories.
 *
 * Each wrapper attempts the live Supabase write first. If it fails because the
 * device is offline, the mutation is appended to the outbox and an optimistic
 * result is returned so the UI (a review session) can continue uninterrupted.
 * The sync engine replays the outbox when connectivity returns.
 *
 * Non-network errors are re-thrown — those are real failures the UI must show.
 */

import { advanceDeckDay, type AdvanceResult } from '../db/decks';
import { upsertReview, type UpsertReviewInput } from '../db/reviews';
import { incrementNoCount, setUserCardTags, updateTriage } from '../db/userCards';
import type { DeckRow, ReviewRow, UserCardRow } from '../db/types';
import type { TriageStatus } from '../seki/types';
import { TOTAL_DAYS } from '../seki/scheduler';
import { isOfflineError } from './connectivity';
import { enqueue, type MutationKind } from './outbox';

/**
 * Run a live write; on a connectivity failure queue the mutation and return
 * `null`. Any other error propagates.
 */
async function tryOnline<T>(
  direct: () => Promise<T>,
  kind: MutationKind,
  payload: unknown,
): Promise<T | null> {
  try {
    return await direct();
  } catch (err) {
    if (isOfflineError(err)) {
      await enqueue(kind, payload);
      return null;
    }
    throw err;
  }
}

export async function queuedUpsertReview(input: UpsertReviewInput): Promise<ReviewRow | null> {
  return tryOnline(() => upsertReview(input), 'upsertReview', input);
}

export async function queuedIncrementNoCount(userCardId: string): Promise<void> {
  await tryOnline(() => incrementNoCount(userCardId), 'incrementNoCount', { userCardId });
}

export async function queuedUpdateTriage(
  userCard: UserCardRow,
  status: TriageStatus,
): Promise<UserCardRow> {
  const result = await tryOnline(() => updateTriage(userCard.id, status), 'updateTriage', {
    userCardId: userCard.id,
    status,
  });
  // Offline: hand back an optimistic row so the session can pivot immediately.
  return result ?? { ...userCard, triage_status: status };
}

/**
 * Set a card's tags. Returns the resulting tag list — the server-normalized
 * one when online, or the requested list optimistically when offline.
 */
export async function queuedSetUserCardTags(userCardId: string, tags: string[]): Promise<string[]> {
  const result = await tryOnline(() => setUserCardTags(userCardId, tags), 'setUserCardTags', {
    userCardId,
    tags,
  });
  return result ? result.tags : tags;
}

export async function queuedAdvanceDeckDay(deck: DeckRow): Promise<AdvanceResult> {
  const result = await tryOnline(() => advanceDeckDay(deck.id), 'advanceDeckDay', {
    deckId: deck.id,
    fromDay: deck.current_day,
  });
  if (result) return result;
  // Offline optimistic advance, mirroring advanceDeckDay's own logic.
  if (deck.current_day >= TOTAL_DAYS) {
    return { deck: { ...deck, status: 'completed' }, isComplete: true };
  }
  return { deck: { ...deck, current_day: deck.current_day + 1 }, isComplete: false };
}
