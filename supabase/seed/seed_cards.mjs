#!/usr/bin/env node
/**
 * Sync the `cards` table to match vocab.json.
 *
 * Usage (from the german-vocab-app/ directory):
 *   node --env-file=.env supabase/seed/seed_cards.mjs
 *
 * Required env vars:
 *   EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (bypasses RLS so inserts/deletes work)
 *
 * Steps:
 *   1. Read vocab.json (the curated source of truth).
 *   2. Upsert all entries against `cards` (keyed on canonical_key).
 *   3. Find existing `cards` rows whose canonical_key is no longer in vocab.json
 *      AND that no `user_cards` rows reference. Delete those orphans.
 *      (Cards still referenced by user_cards are left alone so we don't
 *      destroy live decks; delete the deck first if you want a full reset.)
 */

import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VOCAB_PATH = join(__dirname, 'vocab.json');
const BATCH_SIZE = 500;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const url = requireEnv('EXPO_PUBLIC_SUPABASE_URL');
const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

function toRow(entry) {
  return {
    canonical_key: entry.canonical_key,
    term_de: entry.term_de,
    article: entry.article ?? null,
    pos: entry.pos ?? null,
    translations_ja: entry.translations_ja ?? [],
    translations_en: entry.translations_en ?? [],
    examples: entry.examples ?? [],
    prateritum: entry.prateritum ?? null,
    partizip_ii: entry.partizip_ii ?? null,
    plural: entry.plural ?? null,
    notes: entry.notes ?? [],
    levels: entry.levels ?? [],
    sources: entry.sources ?? [],
    categories: entry.categories ?? [],
  };
}

async function fetchAllReferencedCardIds() {
  const referenced = new Set();
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('user_cards')
      .select('card_id')
      .range(from, from + step - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) referenced.add(r.card_id);
    if (data.length < step) break;
    from += step;
  }
  return referenced;
}

async function fetchAllExistingCards() {
  const out = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('cards')
      .select('id, canonical_key')
      .range(from, from + step - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < step) break;
    from += step;
  }
  return out;
}

async function main() {
  console.log(`Reading ${VOCAB_PATH}...`);
  const raw = await readFile(VOCAB_PATH, 'utf-8');
  /** @type {Array<{canonical_key: string}>} */
  const entries = JSON.parse(raw);
  console.log(`Loaded ${entries.length} entries`);

  // 1. Upsert.
  let upserted = 0;
  let upsertFailed = 0;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const slice = entries.slice(i, i + BATCH_SIZE).map(toRow);
    const { data, error } = await supabase
      .from('cards')
      .upsert(slice, { onConflict: 'canonical_key' })
      .select('id');
    if (error) {
      upsertFailed += slice.length;
      console.error(`Batch ${i}..${i + slice.length} failed:`, error.message);
    } else {
      upserted += data?.length ?? slice.length;
      process.stdout.write(`\rUpserted ${upserted}/${entries.length}`);
    }
  }
  process.stdout.write('\n');

  // 2. Find orphans (in DB but not in vocab.json).
  console.log('\nScanning for orphan rows...');
  const validKeys = new Set(entries.map((e) => e.canonical_key));
  const existing = await fetchAllExistingCards();
  const orphans = existing.filter((c) => !validKeys.has(c.canonical_key));
  console.log(`Found ${orphans.length} orphan card rows (no longer in vocab.json)`);

  if (orphans.length === 0) {
    console.log(`\nDone. Upserted: ${upserted}, failed: ${upsertFailed}.`);
    process.exit(upsertFailed > 0 ? 1 : 0);
  }

  // 3. Of those, only delete orphans not referenced by user_cards.
  const referenced = await fetchAllReferencedCardIds();
  const safeToDelete = orphans.filter((c) => !referenced.has(c.id));
  const stillReferenced = orphans.length - safeToDelete.length;
  console.log(
    `Safe to delete: ${safeToDelete.length} (${stillReferenced} are still referenced by user_cards and will be left alone)`,
  );

  let deleted = 0;
  for (let i = 0; i < safeToDelete.length; i += BATCH_SIZE) {
    const ids = safeToDelete.slice(i, i + BATCH_SIZE).map((c) => c.id);
    const { error } = await supabase.from('cards').delete().in('id', ids);
    if (error) {
      console.error(`Delete batch ${i} failed:`, error.message);
    } else {
      deleted += ids.length;
      process.stdout.write(`\rDeleted ${deleted}/${safeToDelete.length}`);
    }
  }
  process.stdout.write('\n');

  console.log(
    `\nDone. Upserted: ${upserted}, deleted orphans: ${deleted}, still-referenced orphans left: ${stillReferenced}.`,
  );
  if (stillReferenced > 0) {
    console.log(
      'Hint: delete the test deck in the app (Decks tab) and re-run this script to clear the rest.',
    );
  }
  process.exit(upsertFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
