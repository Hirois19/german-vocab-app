/**
 * Core domain types for the SEKI 7x7 vocabulary learning method.
 *
 * SEKI method overview:
 *   - User configures W = words to learn per 7 days (e.g., 700).
 *   - Batch size B = ceil(W / 7), so each day reviews B unique words.
 *   - 1 cycle = 7 days (covers all 7 batches once). 1 deck = 7 cycles = 49 days.
 *   - Each word is reviewed exactly 7 times before the deck is considered complete.
 *
 * Day counter is session-based, not calendar-based: missed days do not advance Day.
 */

/**
 * A stored review rating. 'HALF' is legacy: the session offered it until
 * 2026-07-30 (see ADR 0008) and rows written before then still carry it, so
 * every reader must keep handling it. New reviews are 'YES' or 'NO'.
 */
export type Rating = 'YES' | 'HALF' | 'NO';

/** What the session's rating row can produce. Narrower than `Rating`. */
export type RatingButton = 'YES' | 'NO';

export type TriageStatus = 'pending' | 'known_fully' | 'known' | 'unknown';

export type DeckStatus = 'pending' | 'active' | 'paused' | 'completed';

export type DeckKind = 'main' | 'weak';

/** 'progressive' is legacy: only decks created before ADR 0009 carry it. */
export type TriageMode = 'bulk' | 'progressive';

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface DeckConfig {
  /** Words to learn per 7 days. Default: 700. */
  wordCountPerWeek: number;
}

export interface DeckProgress {
  /** Day index, 1..49. Increments on session completion. */
  currentDay: number;
  /** Cycle index, 1..7. Derived from currentDay. */
  currentCycle: number;
  /** Batch index within current cycle, 1..7. Derived from currentDay. */
  currentBatch: number;
}

export interface BatchAssignment {
  /** Day this assignment is for (1..49). */
  day: number;
  /** Cycle within that day (1..7). */
  cycle: number;
  /** Batch within that cycle (1..7). */
  batch: number;
  /** 1-indexed word range within the deck's active word list, inclusive. */
  wordStart: number;
  wordEnd: number;
}

export interface UserCardReviewSummary {
  /** All ratings for this card, indexed by cycle (1..7). Undefined if not yet reviewed. */
  ratingsByCycle: Partial<Record<number, Rating>>;
}

export interface WeakDeckSettings {
  /** Threshold N: a card with NO count >= N is considered weak. Default 5. */
  weakThresholdN: number;
}
