/**
 * Weak-deck detection. A user_card is "weak" after completing a 49-day SEKI deck if
 *   (NO count across all 7 cycles >= N)
 *   OR
 *   (final cycle rating is NO or HALF)
 *
 * The default threshold N = 5 (i.e., struggling on 5+ of 7 reviews).
 */

import { CYCLES_PER_DECK } from './scheduler';
import type { Rating, UserCardReviewSummary, WeakDeckSettings } from './types';

export const DEFAULT_WEAK_THRESHOLD_N = 5;

export function defaultWeakDeckSettings(): WeakDeckSettings {
  return { weakThresholdN: DEFAULT_WEAK_THRESHOLD_N };
}

export function countRating(card: UserCardReviewSummary, rating: Rating): number {
  let n = 0;
  for (const cycle of Object.keys(card.ratingsByCycle)) {
    if (card.ratingsByCycle[Number(cycle)] === rating) n += 1;
  }
  return n;
}

export function finalCycleRating(card: UserCardReviewSummary): Rating | undefined {
  return card.ratingsByCycle[CYCLES_PER_DECK];
}

export function isWeakCard(card: UserCardReviewSummary, settings: WeakDeckSettings): boolean {
  if (!Number.isInteger(settings.weakThresholdN) || settings.weakThresholdN < 1) {
    throw new RangeError(
      `weakThresholdN must be a positive integer, got ${settings.weakThresholdN}`,
    );
  }
  const noCount = countRating(card, 'NO');
  if (noCount >= settings.weakThresholdN) return true;
  const finalRating = finalCycleRating(card);
  return finalRating === 'NO' || finalRating === 'HALF';
}
