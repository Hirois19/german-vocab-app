-- 0003_triage_mode.sql
-- Per-deck triage mode: bulk (default) requires triage before activation,
-- progressive triages each card the first time it appears in Cycle 1.

alter table public.decks
  add column if not exists triage_mode text not null default 'bulk'
    check (triage_mode in ('bulk', 'progressive'));
