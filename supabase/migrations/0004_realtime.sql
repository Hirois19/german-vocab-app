-- 0004_realtime.sql
-- Enable Realtime broadcasts for the user-owned tables so the app can react
-- to remote changes (e.g., progress made on another device).

alter publication supabase_realtime add table public.decks;
alter publication supabase_realtime add table public.user_cards;
alter publication supabase_realtime add table public.reviews;
alter publication supabase_realtime add table public.tags;
alter publication supabase_realtime add table public.card_tags;
alter publication supabase_realtime add table public.user_settings;
