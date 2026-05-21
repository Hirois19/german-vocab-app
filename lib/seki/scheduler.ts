/**
 * SEKI 7×7 scheduler — pure functions.
 *
 * Schedule shape (W = words per 7 days, B = batch size = ceil(W / 7)):
 *
 *   Day 1   → Cycle 1, Batch 1 → words [1 .. B]
 *   Day 2   → Cycle 1, Batch 2 → words [B+1 .. 2B]
 *   ...
 *   Day 7   → Cycle 1, Batch 7 → words [6B+1 .. min(7B, W)]
 *   Day 8   → Cycle 2, Batch 1 → words [1 .. B]    (2nd pass of the same range)
 *   ...
 *   Day 49  → Cycle 7, Batch 7 → words [6B+1 .. min(7B, W)] (7th pass)
 *
 * Day is session-based: it advances when a session is completed, not by calendar.
 */

import type { BatchAssignment } from './types';

/** Total days in one full SEKI deck cycle. */
export const TOTAL_DAYS = 49;
/** Batches per cycle (one per day). */
export const BATCHES_PER_CYCLE = 7;
/** Cycles per deck (each word seen this many times). */
export const CYCLES_PER_DECK = 7;

/** Batch size = ceil(W / 7). */
export function getBatchSize(wordCountPerWeek: number): number {
  if (!Number.isInteger(wordCountPerWeek) || wordCountPerWeek <= 0) {
    throw new RangeError(`wordCountPerWeek must be a positive integer, got ${wordCountPerWeek}`);
  }
  return Math.ceil(wordCountPerWeek / BATCHES_PER_CYCLE);
}

/** Cycle (1..7) for a given day (1..49). */
export function cycleForDay(day: number): number {
  assertValidDay(day);
  return Math.ceil(day / BATCHES_PER_CYCLE);
}

/** Batch within cycle (1..7) for a given day (1..49). */
export function batchForDay(day: number): number {
  assertValidDay(day);
  return ((day - 1) % BATCHES_PER_CYCLE) + 1;
}

/**
 * Word range (1-indexed, inclusive) within the deck's active word list for a given batch.
 * Batch 7 may have fewer than B words when W is not divisible by 7.
 */
export function wordRangeForBatch(
  batch: number,
  batchSize: number,
  totalWords: number,
): { wordStart: number; wordEnd: number } {
  if (batch < 1 || batch > BATCHES_PER_CYCLE) {
    throw new RangeError(`batch must be 1..${BATCHES_PER_CYCLE}, got ${batch}`);
  }
  const wordStart = (batch - 1) * batchSize + 1;
  const wordEnd = Math.min(batch * batchSize, totalWords);
  return { wordStart, wordEnd };
}

/** Full assignment for a given day. */
export function batchAssignmentForDay(
  day: number,
  wordCountPerWeek: number,
  totalWords: number,
): BatchAssignment {
  const cycle = cycleForDay(day);
  const batch = batchForDay(day);
  const batchSize = getBatchSize(wordCountPerWeek);
  const { wordStart, wordEnd } = wordRangeForBatch(batch, batchSize, totalWords);
  return { day, cycle, batch, wordStart, wordEnd };
}

/**
 * Advance the day counter after a session is completed.
 * Returns the next day, or `null` if the deck is now complete.
 */
export function advanceDay(currentDay: number): number | null {
  assertValidDay(currentDay);
  return currentDay >= TOTAL_DAYS ? null : currentDay + 1;
}

/** Whether the deck has completed all 49 sessions. */
export function isDeckComplete(currentDay: number): boolean {
  if (!Number.isInteger(currentDay)) return false;
  return currentDay > TOTAL_DAYS;
}

function assertValidDay(day: number): void {
  if (!Number.isInteger(day) || day < 1 || day > TOTAL_DAYS) {
    throw new RangeError(`day must be an integer in 1..${TOTAL_DAYS}, got ${day}`);
  }
}
