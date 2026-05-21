-- 0005_card_categories.sql
-- Pre-compute theme categories on the shared `cards` table so the app does
-- not need to run keyword matching at deck-creation time.

alter table public.cards
  add column if not exists categories text[] not null default '{}';

create index if not exists cards_categories_idx
  on public.cards using gin (categories);
