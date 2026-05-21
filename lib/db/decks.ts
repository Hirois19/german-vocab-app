/**
 * Repository for the `decks` table.
 *
 * Invariants enforced at the DB level (see migrations):
 *   - Each user can have at most one deck in `status = 'active'` at any time.
 *   - `(user_id, name)` is unique.
 *   - `current_day` is 1..49.
 *
 * Switching the active deck is therefore a two-step transition:
 *   pauseActive(userId)  →  activate(deckId)
 * In a future iteration this should be wrapped in a Postgres function for atomicity.
 */

import { supabase } from './supabase';
import type { DeckRow } from './types';
import type { DeckKind, TriageMode } from '../seki/types';

const TABLE = 'decks';

export interface CreateDeckInput {
  userId: string;
  name: string;
  kind: DeckKind;
  wordCountPerWeek: number;
  triageMode?: TriageMode;
  parentDeckId?: string | null;
}

export async function createDeck(input: CreateDeckInput): Promise<DeckRow> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: input.userId,
      name: input.name,
      kind: input.kind,
      word_count_per_week: input.wordCountPerWeek,
      triage_mode: input.triageMode ?? 'bulk',
      parent_deck_id: input.parentDeckId ?? null,
      status: 'pending',
      current_day: 1,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as DeckRow;
}

export async function listDecks(userId: string): Promise<DeckRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DeckRow[];
}

export async function getActiveDeck(userId: string): Promise<DeckRow | null> {
  // Multiple decks may be active concurrently (no DB-level constraint after
  // migration 0006). Return the most recently-touched one as the "current".
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('last_session_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data?.[0] as DeckRow | undefined) ?? null) as DeckRow | null;
}

export async function getDeck(id: string): Promise<DeckRow | null> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as DeckRow | null) ?? null;
}

export async function pauseActiveDeck(userId: string): Promise<DeckRow | null> {
  const active = await getActiveDeck(userId);
  if (!active) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status: 'paused' })
    .eq('id', active.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as DeckRow;
}

/**
 * Activate a deck. Caller must have paused any other active deck first
 * (the DB partial unique index on `status='active'` will reject otherwise).
 *
 * For `triage_mode='bulk'` decks, any user_cards still in
 * `triage_status='pending'` are bulk-promoted to `'unknown'` so the deck has
 * a non-empty review pool even if the user skipped explicit triage. In
 * `progressive` mode pending cards are kept as-is and triaged inline.
 */
export async function activateDeck(deckId: string): Promise<DeckRow> {
  const existing = await getDeck(deckId);
  if (!existing) throw new Error(`Deck not found: ${deckId}`);

  if (existing.triage_mode === 'bulk') {
    const { error: triageErr } = await supabase
      .from('user_cards')
      .update({ triage_status: 'unknown' })
      .eq('deck_id', deckId)
      .eq('triage_status', 'pending');
    if (triageErr) throw triageErr;
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status: 'active', start_date: today })
    .eq('id', deckId)
    .select('*')
    .single();
  if (error) throw error;
  return data as DeckRow;
}

/**
 * Atomic-ish switch: pause whatever is active for the user, then activate the target.
 * Not transactional yet — if the second call fails, no deck is active.
 * Callers should refresh state on error.
 */
export async function switchActiveDeck(userId: string, targetDeckId: string): Promise<DeckRow> {
  await pauseActiveDeck(userId);
  return activateDeck(targetDeckId);
}

export async function deleteDeck(deckId: string): Promise<void> {
  // ON DELETE CASCADE on user_cards / reviews / card_tags handles dependent rows.
  const { error } = await supabase.from(TABLE).delete().eq('id', deckId);
  if (error) throw error;
}

export interface AdvanceResult {
  deck: DeckRow;
  isComplete: boolean;
}

export async function advanceDeckDay(deckId: string): Promise<AdvanceResult> {
  const today = new Date().toISOString().slice(0, 10);
  const current = await getDeck(deckId);
  if (!current) throw new Error(`Deck not found: ${deckId}`);
  if (current.current_day >= 49) {
    // Final session was just completed → mark deck completed.
    const { data, error } = await supabase
      .from(TABLE)
      .update({ status: 'completed', last_session_date: today })
      .eq('id', deckId)
      .select('*')
      .single();
    if (error) throw error;
    return { deck: data as DeckRow, isComplete: true };
  }
  const { data, error } = await supabase
    .from(TABLE)
    .update({ current_day: current.current_day + 1, last_session_date: today })
    .eq('id', deckId)
    .select('*')
    .single();
  if (error) throw error;
  return { deck: data as DeckRow, isComplete: false };
}
