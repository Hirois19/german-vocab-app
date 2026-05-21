/**
 * Repository for `reviews` — one row per (user_card_id, cycle).
 *
 * The unique index on `(user_card_id, cycle)` means re-reviewing the same card
 * within the same cycle should upsert, not insert a duplicate. Use `upsertReview`
 * for the happy path.
 */

import { supabase } from './supabase';
import type { ReviewRow } from './types';
import type { Rating } from '../seki/types';

const TABLE = 'reviews';

export interface UpsertReviewInput {
  userId: string;
  userCardId: string;
  cycle: number;
  batch: number;
  day: number;
  rating: Rating;
}

export async function upsertReview(input: UpsertReviewInput): Promise<ReviewRow> {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        user_id: input.userId,
        user_card_id: input.userCardId,
        cycle: input.cycle,
        batch: input.batch,
        day: input.day,
        rating: input.rating,
        reviewed_at: new Date().toISOString(),
      },
      { onConflict: 'user_card_id,cycle' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data as ReviewRow;
}

export async function listReviewsForUserCard(userCardId: string): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_card_id', userCardId)
    .order('cycle', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReviewRow[];
}

export async function listAllReviews(userId: string): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('reviewed_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReviewRow[];
}

export async function listReviewsForDeck(deckId: string, userId: string): Promise<ReviewRow[]> {
  // Reviews don't reference deck_id directly; join via user_cards.
  const { data, error } = await supabase
    .from(TABLE)
    .select('*, user_cards!inner(deck_id)')
    .eq('user_id', userId)
    .eq('user_cards.deck_id', deckId)
    .order('cycle', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReviewRow[];
}
