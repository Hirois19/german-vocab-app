/**
 * CEFR level selection for deck top-up during bulk triage (ADR 0010).
 *
 * Pure logic only; the Supabase side lives in `lib/db/deckBuilder.ts`.
 */

import type { CefrLevel } from './types';

/** CEFR levels in pedagogical order. */
export const LEVEL_ORDER: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** A level counts as covered by a legacy deck only with at least this many cards. */
export const MIN_CARDS_FOR_COVERED_LEVEL = 5;

/** Sort levels into pedagogical order and drop duplicates. */
export function sortLevels(levels: readonly CefrLevel[]): CefrLevel[] {
  return LEVEL_ORDER.filter((lv) => levels.includes(lv));
}

/**
 * Infer which levels a legacy deck (no stored `levels`) covers, from the
 * `levels` arrays of its cards.
 *
 * A level is covered only when at least `minCards` cards carry it. Taking every
 * level of every card would be wrong: a few homonym cards carry several levels
 * (`arm` is ['B1','A1']), so a B1 deck would look like it covers A1, and an
 * A1+A2 deck would look like it covers B1. A real level contributes hundreds of
 * cards; contamination contributes a handful.
 */
export function inferCoveredLevels(
  cardLevels: readonly (readonly string[])[],
  minCards: number = MIN_CARDS_FOR_COVERED_LEVEL,
): CefrLevel[] {
  const counts = new Map<string, number>();
  for (const levels of cardLevels) {
    for (const lv of new Set(levels)) counts.set(lv, (counts.get(lv) ?? 0) + 1);
  }
  return LEVEL_ORDER.filter((lv) => (counts.get(lv) ?? 0) >= minCards);
}

/**
 * Levels to try when topping a deck up with a new level, best first: the levels
 * above the highest covered one in ascending order, then the uncovered lower
 * levels in ascending order. With nothing covered, all levels ascending.
 */
export function nextLevelCandidates(covered: readonly CefrLevel[]): CefrLevel[] {
  const coveredIdx = covered.map((lv) => LEVEL_ORDER.indexOf(lv));
  const top = coveredIdx.length > 0 ? Math.max(...coveredIdx) : -1;
  const above = LEVEL_ORDER.filter((_, i) => i > top);
  const below = LEVEL_ORDER.filter((lv, i) => i < top && !covered.includes(lv));
  return [...above, ...below];
}

/**
 * Pick the level to add next: the first candidate that still has cards that are
 * not in the deck. `remaining` maps a level to that card count (missing = 0).
 * Returns null when nothing is left anywhere.
 */
export function pickNextLevel(
  covered: readonly CefrLevel[],
  remaining: Partial<Record<CefrLevel, number>>,
): CefrLevel | null {
  return nextLevelCandidates(covered).find((lv) => (remaining[lv] ?? 0) > 0) ?? null;
}
