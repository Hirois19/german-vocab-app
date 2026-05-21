/**
 * Repository for `user_cards`.
 *
 * Lifecycle:
 *   - createMany: bulk-insert when populating a new deck from a card pool.
 *   - listByDeck: fetch deck contents (with optional triage filter).
 *   - updateTriage: set known_fully/known/unknown after the user taps a triage button.
 *   - incrementNoCount: when a review with rating='NO' is logged.
 *   - markWeak / markMastered: post-49-day judgment.
 */

import { supabase } from './supabase';
import type { UserCardRow } from './types';
import type { TriageStatus } from '../seki/types';

const TABLE = 'user_cards';

export interface CreateUserCardInput {
  userId: string;
  deckId: string;
  cardId: string;
  position: number;
  /** Source-data tags (cards.categories) copied at creation so the user can edit per-card. */
  tags?: string[];
}

export async function createMany(rows: CreateUserCardInput[]): Promise<UserCardRow[]> {
  if (rows.length === 0) return [];
  const insertRows = rows.map((r) => ({
    user_id: r.userId,
    deck_id: r.deckId,
    card_id: r.cardId,
    position: r.position,
    triage_status: 'pending' as TriageStatus,
    tags: r.tags ?? [],
  }));
  // Batch inserts to avoid hitting Supabase row / parameter limits on large
  // decks (W=700 → 700 user_cards). 200 rows per batch keeps payloads small.
  const BATCH = 200;
  const out: UserCardRow[] = [];
  for (let i = 0; i < insertRows.length; i += BATCH) {
    const slice = insertRows.slice(i, i + BATCH);
    const { data, error } = await supabase.from(TABLE).insert(slice).select('*');
    if (error) throw error;
    if (data) out.push(...(data as UserCardRow[]));
  }
  return out;
}

export async function listAllByUser(userId: string): Promise<UserCardRow[]> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as UserCardRow[];
}

export async function listByDeck(
  deckId: string,
  opts?: { triageStatus?: TriageStatus; limit?: number; offset?: number },
): Promise<UserCardRow[]> {
  let query = supabase.from(TABLE).select('*').eq('deck_id', deckId);
  if (opts?.triageStatus) {
    query = query.eq('triage_status', opts.triageStatus);
  }
  query = query.order('position', { ascending: true });
  if (opts?.limit !== undefined) {
    const offset = opts.offset ?? 0;
    query = query.range(offset, offset + opts.limit - 1);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as UserCardRow[];
}

export async function listByPositionRange(
  deckId: string,
  positionStart: number,
  positionEnd: number,
): Promise<UserCardRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('deck_id', deckId)
    .gte('position', positionStart)
    .lte('position', positionEnd)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as UserCardRow[];
}

/**
 * List the deck's cards that still occupy a slot in the effective deck:
 * everything except cards triaged as pre-known ('known' / 'known_fully').
 * Ordered by position. The session screen takes the first W of these as the
 * effective deck (progressive-mode backfill — see `effectiveDeck`).
 */
export async function listActiveByDeck(deckId: string): Promise<UserCardRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('deck_id', deckId)
    .in('triage_status', ['pending', 'unknown'])
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as UserCardRow[];
}

export async function updateTriage(userCardId: string, status: TriageStatus): Promise<UserCardRow> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ triage_status: status })
    .eq('id', userCardId)
    .select('*')
    .single();
  if (error) throw error;
  return data as UserCardRow;
}

export async function incrementNoCount(userCardId: string): Promise<void> {
  // Supabase JS client does not expose atomic increments directly; rely on RPC
  // when contention becomes a problem. For now, single-user app → safe enough.
  const { data: current, error: readErr } = await supabase
    .from(TABLE)
    .select('no_count')
    .eq('id', userCardId)
    .single();
  if (readErr) throw readErr;
  const next = (current?.no_count ?? 0) + 1;
  const { error } = await supabase.from(TABLE).update({ no_count: next }).eq('id', userCardId);
  if (error) throw error;
}

export async function markWeak(userCardId: string, isWeak: boolean): Promise<void> {
  const { error } = await supabase.from(TABLE).update({ is_weak: isWeak }).eq('id', userCardId);
  if (error) throw error;
}

export async function markMastered(userCardId: string, isMastered: boolean): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ is_mastered: isMastered })
    .eq('id', userCardId);
  if (error) throw error;
}

export async function setUserCardTags(userCardId: string, tags: string[]): Promise<UserCardRow> {
  // Normalize: trim, dedupe, drop empty entries.
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const t of tags) {
    const trimmed = t.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed);
  }
  const { data, error } = await supabase
    .from(TABLE)
    .update({ tags: cleaned })
    .eq('id', userCardId)
    .select('*')
    .single();
  if (error) throw error;
  return data as UserCardRow;
}
