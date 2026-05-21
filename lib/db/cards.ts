/**
 * Read-only repository for the shared `cards` dictionary.
 * The cards table is world-readable (see `supabase/migrations/0002_rls.sql`)
 * and never modified from the client.
 */

import { supabase } from './supabase';
import type { CardRow } from './types';
import type { CefrLevel } from '../seki/types';

const TABLE = 'cards';

export async function countCards(): Promise<number> {
  const { count, error } = await supabase.from(TABLE).select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

const ALL_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/**
 * Total dictionary cards per CEFR level. Runs one head-count query per level
 * in parallel. Levels with zero cards are omitted from the result.
 */
export async function countCardsByLevel(): Promise<Record<string, number>> {
  const results = await Promise.all(
    ALL_LEVELS.map(async (lv) => {
      const { count, error } = await supabase
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .contains('levels', [lv]);
      if (error) throw error;
      return [lv, count ?? 0] as const;
    }),
  );
  const out: Record<string, number> = {};
  for (const [lv, count] of results) {
    if (count > 0) out[lv] = count;
  }
  return out;
}

export async function listCardsByLevel(
  levels: CefrLevel[],
  limit = 1000,
  offset = 0,
): Promise<CardRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .overlaps('levels', levels)
    .order('canonical_key')
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data ?? []) as CardRow[];
}

export async function listCardsByIds(ids: readonly string[]): Promise<CardRow[]> {
  if (ids.length === 0) return [];
  const out: CardRow[] = [];
  const batchSize = 500;
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize);
    const { data, error } = await supabase.from(TABLE).select('*').in('id', chunk);
    if (error) throw error;
    if (data) out.push(...(data as CardRow[]));
  }
  return out;
}

export async function getCard(id: string): Promise<CardRow | null> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as CardRow | null) ?? null;
}

export async function searchCardsByTerm(query: string, limit = 50): Promise<CardRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .ilike('term_de', `%${query}%`)
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CardRow[];
}

/**
 * Return the union of all unique tag values found in cards.categories across
 * the entire dictionary, sorted by category type (theme → POS → level) then
 * alphabetically within each group. Used to populate the tag picker.
 *
 * We fetch up to `maxScan` cards' categories and union client-side. With ~2500
 * cards this is one round trip and runs in < 50 ms.
 */
const LEVEL_VALUES = new Set(['A1', 'A2', 'B1', 'B2', 'C1']);
const POS_VALUES = new Set([
  'noun',
  'verb',
  'adj',
  'adv',
  'pron',
  'prep',
  'conj',
  'num',
  'art',
  'interj',
  'phrase',
  'adj/adv',
]);

export interface AvailableTag {
  name: string;
  kind: 'theme' | 'pos' | 'level';
}

export async function listAvailableTags(): Promise<AvailableTag[]> {
  const { data, error } = await supabase.from(TABLE).select('categories').limit(5000);
  if (error) throw error;
  const seen = new Set<string>();
  for (const row of (data ?? []) as { categories: string[] | null }[]) {
    for (const cat of row.categories ?? []) {
      if (cat && cat.trim()) seen.add(cat.trim());
    }
  }
  const all = Array.from(seen);
  const themes = all.filter((t) => !LEVEL_VALUES.has(t) && !POS_VALUES.has(t)).sort();
  const pos = all.filter((t) => POS_VALUES.has(t)).sort();
  const levels = all.filter((t) => LEVEL_VALUES.has(t)).sort();
  return [
    ...themes.map((name) => ({ name, kind: 'theme' as const })),
    ...pos.map((name) => ({ name, kind: 'pos' as const })),
    ...levels.map((name) => ({ name, kind: 'level' as const })),
  ];
}
