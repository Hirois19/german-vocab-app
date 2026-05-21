-- 0001_init.sql
-- Initial schema for german-vocab-app: cards / decks / user_cards / reviews / tags / settings.
-- Run order: this file first, then 0002_rls.sql.

create extension if not exists pgcrypto;

-- ---------- Cards (shared dictionary) ----------
-- A single global pool of German vocabulary entries. Per-user progress lives
-- elsewhere; this table is read-mostly and never references auth.users.
create table public.cards (
  id              uuid primary key default gen_random_uuid(),
  canonical_key   text not null unique,
  term_de         text not null,
  article         text check (article in ('der', 'die', 'das')),
  pos             text,
  translations_ja jsonb not null default '[]'::jsonb,
  translations_en jsonb not null default '[]'::jsonb,
  examples        jsonb not null default '[]'::jsonb,
  prateritum      text,
  partizip_ii     text,
  plural          text,
  notes           jsonb not null default '[]'::jsonb,
  levels          text[] not null default '{}',
  sources         text[] not null default '{}',
  created_at      timestamptz not null default now()
);
create index cards_canonical_key_idx on public.cards (canonical_key);
create index cards_levels_idx on public.cards using gin (levels);

-- ---------- Decks (per user) ----------
-- A SEKI 7x7 learning unit. Exactly one deck per user can be 'active' at any time.
create type deck_status as enum ('pending', 'active', 'paused', 'completed');
create type deck_kind   as enum ('main', 'weak');

create table public.decks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  name                text not null,
  kind                deck_kind not null default 'main',
  parent_deck_id      uuid references public.decks (id) on delete set null,
  word_count_per_week int  not null check (word_count_per_week >= 7),
  current_day         int  not null default 1 check (current_day between 1 and 49),
  status              deck_status not null default 'pending',
  start_date          date,
  last_session_date   date,
  created_at          timestamptz not null default now()
);
create unique index decks_user_name_idx on public.decks (user_id, name);
-- Only one deck per user can be active simultaneously.
create unique index decks_one_active_per_user_idx
  on public.decks (user_id)
  where status = 'active';

-- ---------- User cards (deck membership + per-card state) ----------
create type triage_status as enum ('pending', 'known_fully', 'known', 'unknown');

create table public.user_cards (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  deck_id        uuid not null references public.decks (id) on delete cascade,
  card_id        uuid not null references public.cards (id) on delete restrict,
  position       int  not null check (position >= 1),
  triage_status  triage_status not null default 'pending',
  is_mastered    boolean not null default false,
  is_weak        boolean not null default false,
  no_count       int  not null default 0,
  created_at     timestamptz not null default now()
);
create unique index user_cards_deck_card_idx on public.user_cards (deck_id, card_id);
create index user_cards_user_idx on public.user_cards (user_id);

-- ---------- Reviews (one row per session evaluation) ----------
create type rating as enum ('YES', 'HALF', 'NO');

create table public.reviews (
  id             uuid primary key default gen_random_uuid(),
  user_card_id   uuid not null references public.user_cards (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  cycle          int  not null check (cycle between 1 and 7),
  batch          int  not null check (batch between 1 and 7),
  day            int  not null check (day between 1 and 49),
  rating         rating not null,
  reviewed_at    timestamptz not null default now()
);
create unique index reviews_card_cycle_idx on public.reviews (user_card_id, cycle);
create index reviews_user_idx on public.reviews (user_id);

-- ---------- Tags (per user) ----------
create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);
create unique index tags_user_name_idx on public.tags (user_id, name);

create table public.card_tags (
  user_card_id uuid not null references public.user_cards (id) on delete cascade,
  tag_id       uuid not null references public.tags (id) on delete cascade,
  primary key (user_card_id, tag_id)
);

-- ---------- User settings ----------
create table public.user_settings (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  weak_threshold_n        int  not null default 5 check (weak_threshold_n >= 1),
  default_word_count_per_week int not null default 700 check (default_word_count_per_week >= 7),
  ui_language             text not null default 'ja' check (ui_language in ('ja', 'en')),
  updated_at              timestamptz not null default now()
);
