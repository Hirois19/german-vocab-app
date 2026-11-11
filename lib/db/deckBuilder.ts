/**
 * Deck builder: create a new deck and populate its user_cards from the shared
 * dictionary by CEFR level. Pure orchestration over the lower-level repositories.
 * The chosen levels are stored on the deck so triage can top it up later (ADR 0010).
 *
 * Flow:
 *   1. Fetch all cards matching the chosen levels and shuffle them.
 *   2. Clip the pool to W words (the deck's target size).
 *   3. Create the deck row.
 *   4. Bulk-insert user_cards with positions 1..W, all triage_status='pending'.
 *
 * Triage is handled separately in the triage UI — every user_card starts pending
 * and the user marks them known/unknown later.
 */

import { listAllCardsByLevel, listCardsByIds } from './cards';
import { createDeck, getDeck, updateDeckLevels } from './decks';
import { listReviewsForDeck } from './reviews';
import { supabase } from './supabase';
import { createMany, listByDeck } from './userCards';
import { getOrCreate as getOrCreateUserSettings } from './userSettings';
import type { CardRow, DeckRow, ReviewRow, UserCardRow } from './types';
import type { CefrLevel, Rating, TriageMode, UserCardReviewSummary } from '../seki/types';
import { inferCoveredLevels, nextLevelCandidates, pickNextLevel, sortLevels } from '../seki/levels';
import { shuffle } from '../seki/shuffle';
import { isWeakCard } from '../seki/weakDeck';

export interface CreateMainDeckInput {
  userId: string;
  name: string;
  levels: CefrLevel[];
  wordCountPerWeek: number;
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

export type TopUpDeckResult =
  /** The rest of the levels chosen at deck creation was added. */
  | { kind: 'remaining'; addedCount: number }
  /** The selected levels were used up; the next level was added. */
  | { kind: 'nextLevel'; level: CefrLevel; addedCount: number }
  /** Nothing left to add anywhere. */
  | { kind: 'none'; addedCount: 0 };

/** Every user_card of a deck. Pages because one request returns at most 1000 rows. */
async function listAllByDeck(deckId: string): Promise<UserCardRow[]> {
  const PAGE = 1000;
  const out: UserCardRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await listByDeck(deckId, { limit: PAGE, offset });
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

/**
 * Top a deck up with more `pending` user_cards when bulk triage runs out of
 * cards before the user has found W unknowns (ADR 0010).
 *
 *   1. Add the cards of the levels chosen at deck creation that are not in the
 *      deck yet (creation only provisions W of them).
 *   2. If none remain, add the next level (see `pickNextLevel`) and record it
 *      in `decks.levels`.
 *
 * Covered levels come from `decks.levels`. Decks created before migration 0012
 * have none, so they are inferred once from the deck's cards and saved. Cards
 * already in the deck (by `card_id`) are skipped, so this is safe to call
 * repeatedly. New rows are positioned after the deck's current maximum position
 * so the SEKI scheduler picks them up in order.
 */
export async function topUpDeck(deckId: string, userId: string): Promise<TopUpDeckResult> {
  const none: TopUpDeckResult = { kind: 'none', addedCount: 0 };
  const deck = await getDeck(deckId);
  if (!deck) return none;
  const existing = await listAllByDeck(deckId);
  if (existing.length === 0) return none;
  const existingCardIds = new Set(existing.map((uc) => uc.card_id));

  let covered = deck.levels ? sortLevels(deck.levels) : null;
  if (covered === null) {
    const existingCards = await listCardsByIds(Array.from(existingCardIds));
    covered = inferCoveredLevels(existingCards.map((c) => c.levels));
    await updateDeckLevels(deckId, covered);
  }

  const maxPosition = existing.reduce((m, uc) => (uc.position > m ? uc.position : m), 0);
  const append = async (cards: CardRow[]) => {
    await createMany(
      cards.map((card, idx) => ({
        userId,
        deckId,
        cardId: card.id,
        position: maxPosition + idx + 1,
        tags: card.categories ?? [],
      })),
    );
  };
  // Appended cards are shuffled too, so triage does not run alphabetically.
  const appendShuffled = (cards: CardRow[]) => append(shuffle(cards));

  // Step 1: the rest of the selected levels.
  if (covered.length > 0) {
    const pool = await listAllCardsByLevel(covered);
    const rest = pool.filter((c) => !existingCardIds.has(c.id));
    if (rest.length > 0) {
      await appendShuffled(rest);
      return { kind: 'remaining', addedCount: rest.length };
    }
  }

  // Step 2: the next level that still has cards outside the deck.
  const leftovers = new Map<CefrLevel, CardRow[]>();
  const remaining: Partial<Record<CefrLevel, number>> = {};
  for (const lv of nextLevelCandidates(covered)) {
    const pool = await listAllCardsByLevel([lv]);
    const rest = pool.filter((c) => !existingCardIds.has(c.id));
    leftovers.set(lv, rest);
    remaining[lv] = rest.length;
  }
  const level = pickNextLevel(covered, remaining);
  if (!level) return none;

  const cards = leftovers.get(level) ?? [];
  await appendShuffled(cards);
  await updateDeckLevels(deckId, sortLevels([...covered, level]));
  return { kind: 'nextLevel', level, addedCount: cards.length };
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

export async function createMainDeck(input: CreateMainDeckInput): Promise<CreateMainDeckResult> {
  if (input.levels.length === 0) {
    throw new Error('At least one CEFR level is required.');
  }
  if (input.wordCountPerWeek < 7) {
    throw new Error('wordCountPerWeek must be at least 7.');
  }

  // Every new deck is bulk-triaged (ADR 0009). The mode is still written to
  // the row because the column and its check constraint remain for decks
  // created earlier.
  const triageMode: TriageMode = 'bulk';

  // Fetch the complete pool (paged past the 1000-row API cap) and shuffle it, so
  // the W provisioned cards are a random sample of the chosen levels and the
  // triage and daily batches follow a random order rather than an alphabetical
  // one (ADR 0010).
  const pool = shuffle(await listAllCardsByLevel(input.levels));
  if (pool.length === 0) {
    throw new Error(`No cards found for levels: ${input.levels.join(', ')}`);
  }

  // Provision exactly W; the user triages those W before activation.
  const slice = pool.slice(0, input.wordCountPerWeek);

  const deck = await createDeck({
    userId: input.userId,
    name: input.name,
    kind: 'main',
    wordCountPerWeek: input.wordCountPerWeek,
    triageMode,
    levels: sortLevels(input.levels),
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
