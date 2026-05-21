/**
 * Known-word triage logic.
 *
 * Before / during the first SEKI cycle, the user can mark each card as:
 *   - "完全にわかる" → triage_status = 'known_fully'  (excluded from deck, archived as pre-known)
 *   - "知ってる"     → triage_status = 'known'        (excluded from deck, archived as pre-known)
 *   - "知らない"     → triage_status = 'unknown'      (included in active SEKI cycle)
 *
 * Cards remain 'pending' until the user triages them.
 *
 * Two triage modes (selected per deck):
 *   - 'bulk':        user triages a large candidate pool up-front, the first W
 *                    "unknown" cards form the deck, SEKI starts after.
 *   - 'progressive': user triages each card the first time it appears in Cycle 1,
 *                    known cards are excluded and replaced from the candidate pool.
 *
 * This file holds the pure logic that is independent of UI or persistence.
 */

import type { TriageStatus } from './types';

export type TriageButton = 'known_fully' | 'known' | 'unknown';

export type TriageMode = 'bulk' | 'progressive';

export const DEFAULT_TRIAGE_MODE: TriageMode = 'bulk';

export function decideTriageStatus(button: TriageButton): TriageStatus {
  return button;
}

/** Whether a card with this triage status is part of the active SEKI deck. */
export function isInActiveDeck(triageStatus: TriageStatus): boolean {
  return triageStatus === 'unknown';
}

/** Whether a card with this triage status should be archived as pre-known. */
export function isPreKnown(triageStatus: TriageStatus): boolean {
  return triageStatus === 'known' || triageStatus === 'known_fully';
}

/**
 * Whether a card still occupies a slot in the deck's "effective" word list.
 *
 * A card is excluded once triaged as pre-known. 'pending' (not yet triaged) and
 * 'unknown' (kept for review) both still count. This is the predicate used to
 * build the effective deck for the SEKI schedule — see `effectiveDeck`.
 */
export function occupiesDeckSlot(triageStatus: TriageStatus): boolean {
  return !isPreKnown(triageStatus);
}

/**
 * Compute the "effective deck" for the SEKI schedule.
 *
 * In both triage modes the deck may be provisioned with more candidate cards
 * than the target W (especially in progressive mode, where the whole candidate
 * pool is loaded so known words can be replaced). The effective deck is the
 * first W cards, in position order, that still occupy a slot (not pre-known).
 *
 * As the user triages cards as 'known' during cycle 1, those drop out and the
 * cards behind them shift forward — this is the "繰り上げ補充" (backfill) the
 * progressive mode relies on. Pure function so it is unit-testable.
 *
 * @param cards  Candidate user_cards. Need not be pre-sorted.
 * @param targetW  Deck size target (word_count_per_week).
 */
export function effectiveDeck<T extends { position: number; triage_status: TriageStatus }>(
  cards: readonly T[],
  targetW: number,
): T[] {
  return [...cards]
    .filter((c) => occupiesDeckSlot(c.triage_status))
    .sort((a, b) => a.position - b.position)
    .slice(0, targetW);
}

/**
 * Pick the cards to present in one day's session.
 *
 * Takes the day's batch slice out of the effective deck ([wordStart, wordEnd],
 * 1-indexed) and prepends any cards in earlier slots that are still 'pending'.
 *
 * Those "stragglers" appear in progressive mode: when a card is triaged 'known'
 * the cards behind it shift forward, so a still-untriaged card can move out of
 * an already-completed batch. Carrying it into the next session guarantees
 * every effective-deck card is triaged exactly once during cycle 1. In bulk
 * mode (or cycle 2+) no card is 'pending', so this reduces to the batch slice.
 *
 * @param deck  The effective deck (already first-W, position-ordered).
 * @param wordStart  1-indexed inclusive start of the day's batch.
 * @param wordEnd  1-indexed inclusive end of the day's batch.
 */
export function sessionBatch<T extends { triage_status: TriageStatus }>(
  deck: readonly T[],
  wordStart: number,
  wordEnd: number,
): T[] {
  const startIdx = Math.max(0, wordStart - 1);
  const batch = deck.slice(startIdx, Math.max(startIdx, wordEnd));
  const stragglers = deck.slice(0, startIdx).filter((c) => c.triage_status === 'pending');
  return [...stragglers, ...batch];
}

/**
 * Given an ordered candidate pool and a target deck size W, walk the pool
 * and pick the first W items that satisfy the predicate (e.g., "not yet triaged
 * as known"). Returns the picked indices in pool order.
 *
 * Used by the bulk-triage flow once the user has marked enough items, and by
 * the progressive flow when promoting the next replacement word.
 */
export function pickFirstUnknowns<T>(
  pool: readonly T[],
  targetCount: number,
  isUnknown: (item: T, index: number) => boolean,
): T[] {
  if (!Number.isInteger(targetCount) || targetCount < 0) {
    throw new RangeError(`targetCount must be a non-negative integer, got ${targetCount}`);
  }
  const picked: T[] = [];
  for (let i = 0; i < pool.length && picked.length < targetCount; i += 1) {
    const item = pool[i];
    if (item === undefined) continue;
    if (isUnknown(item, i)) picked.push(item);
  }
  return picked;
}
