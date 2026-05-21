/**
 * Cards cache: in-memory map of the shared `cards` table, persisted to
 * AsyncStorage so sessions load instantly and work when offline.
 *
 * Lifecycle:
 *   - On import, attempt to hydrate from AsyncStorage (synchronously kicks
 *     off an async load).
 *   - `prefetchCards()` is called at app start to refresh from Supabase
 *     in the background.
 *   - `getCachedCardsByIds(ids)` returns whatever is in memory; if some IDs
 *     are missing, the caller falls back to Supabase for those.
 *
 * The cache is keyed on card id. It is a flat list of all cards (~4000
 * entries, ~1.7 MB serialized) — small enough to keep in memory and persist
 * as a single AsyncStorage value.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { listCardsByIds as fetchByIds } from '@/lib/db/cards';
import { supabase } from '@/lib/db/supabase';
import type { CardRow } from '@/lib/db/types';

// v2: cards now include the `categories` field (migration 0005). Bumping the
// key invalidates pre-categorize caches on app upgrade.
const STORAGE_KEY = 'german-vocab-app:cards-cache:v2';

let memoryCache: Map<string, CardRow> = new Map();
let hydrated = false;
let hydratingPromise: Promise<void> | null = null;

async function hydrateFromStorage(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw) as CardRow[];
    memoryCache = new Map(arr.map((c) => [c.id, c]));
  } catch (err) {
    console.warn('[cardsCache] hydrate failed:', err);
  } finally {
    hydrated = true;
  }
}

function ensureHydrated(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (!hydratingPromise) {
    hydratingPromise = hydrateFromStorage();
  }
  return hydratingPromise;
}

// Kick off hydration as soon as this module is imported.
void ensureHydrated();

/**
 * Background-fetch the full cards table from Supabase and store the result
 * to AsyncStorage. Safe to call on every app start; it overwrites whatever
 * was cached.
 */
export async function prefetchCards(): Promise<{ count: number }> {
  await ensureHydrated();
  const all: CardRow[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .order('canonical_key')
      .range(from, from + step - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as CardRow[]));
    if (data.length < step) break;
    from += step;
  }
  memoryCache = new Map(all.map((c) => [c.id, c]));
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (err) {
    console.warn('[cardsCache] persist failed:', err);
  }
  return { count: all.length };
}

/**
 * Local-first lookup. Returns cached cards for the given ids and a list of
 * ids that were NOT found locally — the caller can then fetch those from
 * Supabase.
 */
export async function getCachedCardsByIds(
  ids: readonly string[],
): Promise<{ hits: CardRow[]; misses: string[] }> {
  await ensureHydrated();
  const hits: CardRow[] = [];
  const misses: string[] = [];
  for (const id of ids) {
    const c = memoryCache.get(id);
    if (c) hits.push(c);
    else misses.push(id);
  }
  return { hits, misses };
}

/**
 * Local-first variant of cards.listCardsByIds. Returns cached hits
 * immediately; for misses it falls back to Supabase and warms the cache.
 */
export async function listCardsByIdsCached(ids: readonly string[]): Promise<CardRow[]> {
  if (ids.length === 0) return [];
  const { hits, misses } = await getCachedCardsByIds(ids);
  if (misses.length === 0) return hits;
  // Network fallback for missing ids — warm the cache with the result.
  const fresh = await fetchByIds(misses);
  for (const c of fresh) memoryCache.set(c.id, c);
  return [...hits, ...fresh];
}

export function isCachePopulated(): boolean {
  return memoryCache.size > 0;
}

export function getCacheSize(): number {
  return memoryCache.size;
}
