/**
 * Sync engine: drains the outbox into Supabase once connectivity returns.
 *
 * Mutations are applied in FIFO order so that, e.g., the review writes of a
 * session land before the `advanceDeckDay` that follows them. If a network
 * error reappears mid-drain we stop and keep the remaining mutations queued.
 */

import { advanceDeckDay, getDeck } from '../db/decks';
import { upsertReview, type UpsertReviewInput } from '../db/reviews';
import { incrementNoCount, setUserCardTags, updateTriage } from '../db/userCards';
import type { TriageStatus } from '../seki/types';
import { isOfflineError } from './connectivity';
import {
  bumpAttempts,
  countOutbox,
  listOutbox,
  removeFromOutbox,
  type OutboxMutation,
} from './outbox';

/** A mutation that keeps failing with a real (non-network) error is dropped. */
const MAX_ATTEMPTS = 8;

async function applyMutation(m: OutboxMutation): Promise<void> {
  switch (m.kind) {
    case 'upsertReview':
      await upsertReview(m.payload as UpsertReviewInput);
      return;
    case 'incrementNoCount':
      await incrementNoCount((m.payload as { userCardId: string }).userCardId);
      return;
    case 'updateTriage': {
      const p = m.payload as { userCardId: string; status: TriageStatus };
      await updateTriage(p.userCardId, p.status);
      return;
    }
    case 'setUserCardTags': {
      const p = m.payload as { userCardId: string; tags: string[] };
      await setUserCardTags(p.userCardId, p.tags);
      return;
    }
    case 'advanceDeckDay': {
      const p = m.payload as { deckId: string; fromDay: number };
      // Idempotent: only advance if the deck is still on the day we recorded
      // when the mutation was queued. Guards against a double-apply if the
      // app crashed between the server ack and removing the mutation.
      const deck = await getDeck(p.deckId);
      if (deck && deck.current_day === p.fromDay) {
        await advanceDeckDay(p.deckId);
      }
      return;
    }
  }
}

export interface DrainResult {
  synced: number;
  failed: number;
  remaining: number;
}

let draining = false;

/**
 * Apply every queued mutation. Safe to call repeatedly and concurrently — a
 * second call while a drain is in flight is a no-op. Returns counts for the UI.
 */
export async function drainOutbox(): Promise<DrainResult> {
  if (draining) {
    return { synced: 0, failed: 0, remaining: await countOutbox() };
  }
  draining = true;
  let synced = 0;
  let failed = 0;
  try {
    const items = await listOutbox();
    for (const m of items) {
      try {
        await applyMutation(m);
        await removeFromOutbox(m.id);
        synced += 1;
      } catch (err) {
        if (isOfflineError(err)) {
          // Still offline — stop, keep this and the rest of the queue intact.
          break;
        }
        // A real server-side error. Count the attempt; drop poison messages
        // so one bad mutation can't block the queue forever.
        await bumpAttempts(m.id);
        failed += 1;
        if (m.attempts + 1 >= MAX_ATTEMPTS) {
          await removeFromOutbox(m.id);
        }
      }
    }
  } finally {
    draining = false;
  }
  return { synced, failed, remaining: await countOutbox() };
}
