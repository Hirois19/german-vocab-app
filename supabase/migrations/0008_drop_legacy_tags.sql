-- 0008_drop_legacy_tags.sql
-- Remove the legacy per-user tag namespace. Tagging now lives entirely on
-- `user_cards.tags` (text[], added in migration 0007), seeded from the
-- source-data `cards.categories`. The `tags` table and the `card_tags`
-- junction are no longer read or written by the app.

-- Drop from the realtime publication first (ignore errors if already absent).
do $$
begin
  alter publication supabase_realtime drop table public.card_tags;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime drop table public.tags;
exception when others then null;
end $$;

-- card_tags references tags; drop the junction first.
drop table if exists public.card_tags cascade;
drop table if exists public.tags cascade;
