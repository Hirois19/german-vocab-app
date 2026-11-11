#!/usr/bin/env node
/**
 * Re-triage decks that hold a card which was split into two (homonyms such as
 * `arm`: adjective / der Arm, see ADR 0010 and the extractor in extract_vocab.py).
 *
 * Usage (from the german-vocab-app/ directory):
 *   node --env-file=.env supabase/seed/requeue_split_cards.mjs           # dry run
 *   node --env-file=.env supabase/seed/requeue_split_cards.mjs --apply   # write
 *   Add --deck=<deck id> to limit either run to one deck. Without it every deck
 *   that holds an original card is touched, including active ones mid-schedule.
 *
 * Required env vars:
 *   EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (bypasses RLS: this touches every user's rows)
 *
 * Run order: migration 0012, then seed_cards.mjs with the new vocab.json, then
 * this script (dry run first).
 *
 * What it does:
 *   1. Every user_card that points at one of the ORIGINAL cards is set back to
 *      triage_status 'pending', whatever it was, so the user judges the card
 *      again. Reviews are never deleted; a user_card that has some gets a
 *      warning with the count.
 *   2. Every deck that holds an original card gets the new split card as a
 *      'pending' user_card (position = deck max + 1, tags from cards.categories),
 *      but only when the new card's level is among the deck's levels
 *      (decks.levels, or for legacy decks the levels carried by at least 5 of
 *      its cards, the same rule as inferCoveredLevels). Weak decks are left
 *      alone: they are a fixed set of weak words. Cards already in the deck are
 *      skipped.
 */

import { createClient } from '@supabase/supabase-js';

/** original canonical_key -> canonical_keys of the cards split off from it. */
const SPLITS = {
  arm: ['arm#adj'],
  stolz: ['stolz#noun'],
  wissen: ['wissen#noun'],
  // Not a homonym and not split; listed so its cards are re-triaged as well.
  termin: [],
  essen: ['essen#verb'],
  morgen: ['morgen#noun'],
  orange: ['orange#noun'],
  sein: ['sein#verb'],
  streben: ['streben#verb'],
  zu: ['zu#prep'],
};

const MIN_CARDS_FOR_COVERED_LEVEL = 5;
const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const PAGE = 1000;
const CHUNK = 100;

const apply = process.argv.includes('--apply');
const onlyDeck = process.argv.find((a) => a.startsWith('--deck='))?.slice('--deck='.length) ?? null;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const supabase = createClient(
  requireEnv('EXPO_PUBLIC_SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);

function fail(message) {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Run `build(chunk)` for each chunk of `values` and concatenate the paged results. */
async function selectIn(values, build) {
  const out = [];
  for (const part of chunks(values, CHUNK)) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build(part).range(from, from + PAGE - 1);
      if (error) throw error;
      out.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

/** Levels carried by at least MIN_CARDS_FOR_COVERED_LEVEL cards (see lib/seki/levels.ts). */
function inferCoveredLevels(cardLevels) {
  const counts = new Map();
  for (const levels of cardLevels) {
    for (const lv of new Set(levels)) counts.set(lv, (counts.get(lv) ?? 0) + 1);
  }
  return LEVEL_ORDER.filter((lv) => (counts.get(lv) ?? 0) >= MIN_CARDS_FOR_COVERED_LEVEL);
}

async function main() {
  console.log(
    apply ? 'MODE: apply (writing)\n' : 'MODE: dry run (no writes, pass --apply to write)\n',
  );

  // Preconditions: decks.levels exists (migration 0012).
  {
    const { error } = await supabase.from('decks').select('levels').limit(1);
    if (error) {
      fail(
        `decks.levels is not readable (${error.message}). Apply supabase/migrations/0012_deck_levels.sql first.`,
      );
    }
  }

  // Preconditions: original and split cards exist (seed has run).
  const originalKeys = Object.keys(SPLITS);
  const splitKeys = Object.values(SPLITS).flat();
  const allKeys = [...originalKeys, ...splitKeys];
  const cardRows = await selectIn(allKeys, (part) =>
    supabase
      .from('cards')
      .select('id, canonical_key, levels, categories')
      .in('canonical_key', part),
  );
  const cardByKey = new Map(cardRows.map((c) => [c.canonical_key, c]));
  const missing = allKeys.filter((k) => !cardByKey.has(k));
  if (missing.length > 0) {
    fail(
      `cards not found for keys: ${missing.join(', ')}. Run seed_cards.mjs with the new vocab.json first.`,
    );
  }

  const originalIds = originalKeys.map((k) => cardByKey.get(k).id);
  const keyByOriginalId = new Map(originalKeys.map((k) => [cardByKey.get(k).id, k]));

  // 1. user_cards pointing at an original card.
  const affectedAll = await selectIn(originalIds, (part) =>
    supabase
      .from('user_cards')
      .select('id, user_id, deck_id, card_id, triage_status, position')
      .in('card_id', part)
      .order('id'),
  );
  const affected = onlyDeck ? affectedAll.filter((uc) => uc.deck_id === onlyDeck) : affectedAll;
  console.log(
    `user_cards on original cards: ${affected.length}` +
      (onlyDeck ? ` (deck ${onlyDeck} only, ${affectedAll.length} across all decks)` : ''),
  );

  const deckIds = [...new Set(affected.map((uc) => uc.deck_id))];
  const decks = await selectIn(deckIds, (part) =>
    supabase.from('decks').select('id, user_id, name, kind, levels').in('id', part).order('id'),
  );
  const deckById = new Map(decks.map((d) => [d.id, d]));

  // Reviews are kept; only report how many exist.
  const reviews = await selectIn(
    affected.map((uc) => uc.id),
    (part) =>
      supabase.from('reviews').select('id, user_card_id').in('user_card_id', part).order('id'),
  );
  const reviewCount = new Map();
  for (const r of reviews)
    reviewCount.set(r.user_card_id, (reviewCount.get(r.user_card_id) ?? 0) + 1);

  console.log('\n--- Reset to pending ---');
  for (const uc of affected) {
    const deck = deckById.get(uc.deck_id);
    const n = reviewCount.get(uc.id) ?? 0;
    console.log(
      `deck "${deck?.name ?? '?'}" (${uc.deck_id}) key=${keyByOriginalId.get(uc.card_id)} ` +
        `old status=${uc.triage_status}` +
        (n > 0 ? `  WARNING: ${n} review(s) exist and are kept` : ''),
    );
  }

  // 2. New split cards per deck.
  console.log('\n--- Add split cards ---');
  const inserts = [];
  for (const deckId of deckIds) {
    const deck = deckById.get(deckId);
    const deckCards = await selectIn([deckId], (part) =>
      supabase.from('user_cards').select('card_id, position').in('deck_id', part).order('id'),
    );
    const presentIds = new Set(deckCards.map((r) => r.card_id));
    let nextPosition = deckCards.reduce((m, r) => Math.max(m, r.position), 0) + 1;

    const wanted = new Set();
    for (const uc of affected.filter((a) => a.deck_id === deckId)) {
      for (const k of SPLITS[keyByOriginalId.get(uc.card_id)]) wanted.add(k);
    }
    if (wanted.size === 0) continue;

    if (deck.kind === 'weak') {
      console.log(`deck "${deck.name}" (${deckId}): skipped, weak decks keep their fixed word set`);
      continue;
    }

    let levels = deck.levels;
    let source = 'decks.levels';
    if (!levels) {
      const cards = await selectIn([...presentIds], (part) =>
        supabase.from('cards').select('id, levels').in('id', part).order('id'),
      );
      levels = inferCoveredLevels(cards.map((c) => c.levels));
      source = 'inferred from cards';
    }

    for (const key of [...wanted].sort()) {
      const card = cardByKey.get(key);
      if (presentIds.has(card.id)) {
        console.log(`deck "${deck.name}" (${deckId}): ${key} already present, skipped`);
        continue;
      }
      if (!card.levels.some((lv) => levels.includes(lv))) {
        console.log(
          `deck "${deck.name}" (${deckId}): ${key} skipped, level ${card.levels.join('/')} is outside the deck (${source}: ${levels.join(', ') || 'none'})`,
        );
        continue;
      }
      inserts.push({
        user_id: deck.user_id,
        deck_id: deckId,
        card_id: card.id,
        position: nextPosition,
        triage_status: 'pending',
        tags: card.categories ?? [],
      });
      console.log(
        `deck "${deck.name}" (${deckId}): add ${key} as pending at position ${nextPosition}`,
      );
      nextPosition += 1;
    }
  }

  console.log(`\nSummary: ${affected.length} user_card(s) to reset, ${inserts.length} to insert.`);
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write.');
    return;
  }

  for (const part of chunks(
    affected.map((uc) => uc.id),
    CHUNK,
  )) {
    const { error } = await supabase
      .from('user_cards')
      .update({ triage_status: 'pending' })
      .in('id', part);
    if (error) throw error;
  }
  for (const part of chunks(inserts, 200)) {
    const { error } = await supabase.from('user_cards').insert(part);
    if (error) throw error;
  }
  console.log('Applied.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
