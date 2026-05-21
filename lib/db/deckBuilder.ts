/**
 * Deck builder: create a new deck and populate its user_cards from the shared
 * dictionary by CEFR level. Pure orchestration over the lower-level repositories.
 *
 * Flow:
 *   1. Fetch all cards matching the chosen levels (ordered by canonical_key).
 *   2. Clip the pool to W words (the deck's target size).
 *   3. Create the deck row.
 *   4. Bulk-insert user_cards with positions 1..W, all triage_status='pending'.
 *
 * Triage is handled separately in the triage UI — every user_card starts pending
 * and the user marks them known/unknown later.
 */

import { listCardsByIds, listCardsByLevel } from './cards';
import { createDeck } from './decks';
import { listReviewsForDeck } from './reviews';
import { supabase } from './supabase';
import { createMany, listByDeck } from './userCards';
import { getOrCreate as getOrCreateUserSettings } from './userSettings';
import type { DeckRow, ReviewRow } from './types';
import type { CefrLevel, Rating, TriageMode, UserCardReviewSummary } from '../seki/types';
import { isWeakCard } from '../seki/weakDeck';

export interface CreateMainDeckInput {
  userId: string;
  name: string;
  levels: CefrLevel[];
  wordCountPerWeek: number;
  triageMode?: TriageMode;
}

export interface CreateMainDeckResult {
  deck: DeckRow;
  populated: number;
  poolSize: number;
}

/**
 * Build a per-card review summary from a flat list of review rows.
 */
function summariseReviewsByUserCard(
  reviews: readonly ReviewRow[],
): Map<string, UserCardReviewSummary> {
  const out = new Map<string, UserCardReviewSummary>();
  for (const r of reviews) {
    let entry = out.get(r.user_card_id);
    if (!entry) {
      entry = { ratingsByCycle: {} };
      out.set(r.user_card_id, entry);
    }
    entry.ratingsByCycle[r.cycle] = r.rating as Rating;
  }
  return out;
}

/**
 * After a deck has reached day 49, scan all of its user_cards, apply
 * `isWeakCard` to the per-card review history, and set `is_weak` and
 * `is_mastered` accordingly. Idempotent.
 *
 * Returns counts so the caller can show a summary to the user.
 */
export async function evaluateWeakOnCompletion(
  deckId: string,
  userId: string,
): Promise<{ weak: number; mastered: number }> {
  const settings = await getOrCreateUserSettings(userId);
  const reviews = await listReviewsForDeck(deckId, userId);
  const summaries = summariseReviewsByUserCard(reviews);
  const userCards = await listByDeck(deckId);

  const weakIds: string[] = [];
  const masteredIds: string[] = [];
  for (const uc of userCards) {
    // Pre-known cards don't participate in SEKI judgement.
    if (uc.triage_status !== 'unknown') continue;
    const summary = summaries.get(uc.id) ?? { ratingsByCycle: {} };
    const weak = isWeakCard(summary, { weakThresholdN: settings.weak_threshold_n });
    if (weak) weakIds.push(uc.id);
    else masteredIds.push(uc.id);
  }

  if (weakIds.length > 0) {
    const { error } = await supabase
      .from('user_cards')
      .update({ is_weak: true, is_mastered: false })
      .in('id', weakIds);
    if (error) throw error;
  }
  if (masteredIds.length > 0) {
    const { error } = await supabase
      .from('user_cards')
      .update({ is_mastered: true, is_weak: false })
      .in('id', masteredIds);
    if (error) throw error;
  }

  return { weak: weakIds.length, mastered: masteredIds.length };
}

/**
 * List card_ids that have been judged weak in any deck but are not yet part
 * of a weak deck. These form the "weak pool" the user can spend on a new
 * 苦手デッキ.
 */
export async function listAvailableWeakCardIds(userId: string): Promise<string[]> {
  const { data: weak, error: e1 } = await supabase
    .from('user_cards')
    .select('card_id')
    .eq('user_id', userId)
    .eq('is_weak', true);
  if (e1) throw e1;

  // Card IDs already placed inside an existing weak deck.
  const { data: inWeak, error: e2 } = await supabase
    .from('user_cards')
    .select('card_id, decks!inner(kind)')
    .eq('user_id', userId)
    .eq('decks.kind', 'weak');
  if (e2) throw e2;

  const taken = new Set(((inWeak ?? []) as { card_id: string }[]).map((r) => r.card_id));
  const distinct = Array.from(
    new Set(((weak ?? []) as { card_id: string }[]).map((r) => r.card_id)),
  );
  return distinct.filter((id) => !taken.has(id));
}

export interface CreateWeakDeckResult {
  deck: DeckRow;
  populated: number;
  poolSize: number;
}

/**
 * Create a new 苦手デッキ from the available weak pool. Caller chooses the
 * deck size W; we slice the pool to that. If the pool is smaller than W, the
 * deck is created with whatever is available (small first cycle).
 */
export async function createWeakDeck(input: {
  userId: string;
  name: string;
  wordCountPerWeek: number;
}): Promise<CreateWeakDeckResult> {
  if (input.wordCountPerWeek < 7) {
    throw new Error('wordCountPerWeek must be at least 7.');
  }
  const cardIds = await listAvailableWeakCardIds(input.userId);
  if (cardIds.length === 0) {
    throw new Error('No weak words available yet. Complete a SEKI cycle first.');
  }
  const slice = cardIds.slice(0, input.wordCountPerWeek);

  const deck = await createDeck({
    userId: input.userId,
    name: input.name,
    kind: 'weak',
    wordCountPerWeek: input.wordCountPerWeek,
  });

  // Fetch the underlying cards so we can seed each user_card's tags from
  // cards.categories (theme + POS + level), matching what the source data ships.
  const cardsByIdEntries = await listCardsByIds(slice);
  const tagsByCardId = new Map(cardsByIdEntries.map((c) => [c.id, c.categories ?? []]));

  await createMany(
    slice.map((cardId, idx) => ({
      userId: input.userId,
      deckId: deck.id,
      cardId,
      position: idx + 1,
      tags: tagsByCardId.get(cardId) ?? [],
    })),
  );

  return { deck, populated: slice.length, poolSize: cardIds.length };
}

/** Hard cap on how many candidate cards a single deck is provisioned with. */
const MAX_DECK_PROVISION = 5000;

export async function createMainDeck(input: CreateMainDeckInput): Promise<CreateMainDeckResult> {
  if (input.levels.length === 0) {
    throw new Error('At least one CEFR level is required.');
  }
  if (input.wordCountPerWeek < 7) {
    throw new Error('wordCountPerWeek must be at least 7.');
  }

  const triageMode = input.triageMode ?? 'bulk';

  // Fetch the candidate pool. Progressive mode provisions the whole level pool
  // so known words triaged inline can be backfilled from later candidates;
  // bulk mode only needs a modest buffer over W.
  const fetchLimit =
    triageMode === 'progressive' ? MAX_DECK_PROVISION : Math.max(input.wordCountPerWeek * 2, 2000);
  const pool = await listCardsByLevel(input.levels, fetchLimit);
  if (pool.length === 0) {
    throw new Error(`No cards found for levels: ${input.levels.join(', ')}`);
  }

  // Progressive: load the entire pool as 'pending' candidates. The session's
  // effective deck (first W non-excluded) shifts forward as cards are triaged.
  // Bulk: provision exactly W; the user triages those W before activation.
  const slice = triageMode === 'progressive' ? pool : pool.slice(0, input.wordCountPerWeek);

  const deck = await createDeck({
    userId: input.userId,
    name: input.name,
    kind: 'main',
    wordCountPerWeek: input.wordCountPerWeek,
    triageMode,
  });

  await createMany(
    slice.map((card, idx) => ({
      userId: input.userId,
      deckId: deck.id,
      cardId: card.id,
      position: idx + 1,
      // Seed editable per-card tags from the source-data theme/POS/level set.
      tags: card.categories ?? [],
    })),
  );

  return { deck, populated: slice.length, poolSize: pool.length };
}
