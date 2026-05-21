-- 0007_user_card_tags.sql
-- Add per-user-card editable tags, initialized from the shared cards.categories
-- column. This replaces the legacy `tags` + `card_tags` junction tables for the
-- session-level tag picker. Pre-computed source-data tags (themes / POS / level)
-- become the default; users can add or remove tags on each user_card.

alter table public.user_cards
  add column if not exists tags text[] not null default '{}';

create index if not exists user_cards_tags_idx
  on public.user_cards using gin (tags);

-- Backfill: copy each user_card's source-data categories into its tags array.
-- Only writes empty arrays so re-running is idempotent.
update public.user_cards uc
set tags = coalesce(c.categories, '{}')
from public.cards c
where uc.card_id = c.id
  and (uc.tags is null or array_length(uc.tags, 1) is null);
