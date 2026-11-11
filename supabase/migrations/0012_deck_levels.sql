-- 0012_deck_levels.sql
-- The CEFR levels a deck covers, in pedagogical order. Written at deck creation
-- and extended when bulk triage tops the deck up with another level. Used to
-- decide what to add next, instead of guessing from the cards' own `levels`
-- tags (some homonym cards carry several levels). NULL for decks created
-- before this migration; the app infers and backfills them on first use.

alter table public.decks
  add column if not exists levels text[];
