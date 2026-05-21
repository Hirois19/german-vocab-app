-- 0002_rls.sql
-- Row Level Security policies. Run after 0001_init.sql.
-- Rule:
--   cards         → world-readable (it's the shared dictionary), writes restricted to service role.
--   everything-else (decks / user_cards / reviews / tags / card_tags / user_settings)
--                 → owner-only reads AND writes, gated on auth.uid() = user_id.

-- ---------- cards: world read, no client writes ----------
alter table public.cards enable row level security;

create policy "cards_select_all"
  on public.cards for select
  using (true);

-- No insert / update / delete policies → only the service role bypasses RLS.

-- ---------- decks ----------
alter table public.decks enable row level security;

create policy "decks_owner_select"
  on public.decks for select
  using (auth.uid() = user_id);

create policy "decks_owner_insert"
  on public.decks for insert
  with check (auth.uid() = user_id);

create policy "decks_owner_update"
  on public.decks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "decks_owner_delete"
  on public.decks for delete
  using (auth.uid() = user_id);

-- ---------- user_cards ----------
alter table public.user_cards enable row level security;

create policy "user_cards_owner_select"
  on public.user_cards for select
  using (auth.uid() = user_id);

create policy "user_cards_owner_insert"
  on public.user_cards for insert
  with check (auth.uid() = user_id);

create policy "user_cards_owner_update"
  on public.user_cards for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_cards_owner_delete"
  on public.user_cards for delete
  using (auth.uid() = user_id);

-- ---------- reviews ----------
alter table public.reviews enable row level security;

create policy "reviews_owner_select"
  on public.reviews for select
  using (auth.uid() = user_id);

create policy "reviews_owner_insert"
  on public.reviews for insert
  with check (auth.uid() = user_id);

create policy "reviews_owner_update"
  on public.reviews for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "reviews_owner_delete"
  on public.reviews for delete
  using (auth.uid() = user_id);

-- ---------- tags ----------
alter table public.tags enable row level security;

create policy "tags_owner_select" on public.tags for select using (auth.uid() = user_id);
create policy "tags_owner_insert" on public.tags for insert with check (auth.uid() = user_id);
create policy "tags_owner_update" on public.tags for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tags_owner_delete" on public.tags for delete using (auth.uid() = user_id);

-- ---------- card_tags (join table) ----------
-- Owner is derived from the user_card row.
alter table public.card_tags enable row level security;

create policy "card_tags_owner_select"
  on public.card_tags for select
  using (
    exists (
      select 1 from public.user_cards uc
      where uc.id = card_tags.user_card_id
        and uc.user_id = auth.uid()
    )
  );

create policy "card_tags_owner_insert"
  on public.card_tags for insert
  with check (
    exists (
      select 1 from public.user_cards uc
      where uc.id = card_tags.user_card_id
        and uc.user_id = auth.uid()
    )
  );

create policy "card_tags_owner_delete"
  on public.card_tags for delete
  using (
    exists (
      select 1 from public.user_cards uc
      where uc.id = card_tags.user_card_id
        and uc.user_id = auth.uid()
    )
  );

-- ---------- user_settings ----------
alter table public.user_settings enable row level security;

create policy "user_settings_owner_select" on public.user_settings for select using (auth.uid() = user_id);
create policy "user_settings_owner_insert" on public.user_settings for insert with check (auth.uid() = user_id);
create policy "user_settings_owner_update" on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_settings_owner_delete" on public.user_settings for delete using (auth.uid() = user_id);
