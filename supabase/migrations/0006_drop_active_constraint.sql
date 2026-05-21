-- 0006_drop_active_constraint.sql
-- Drop the partial unique index that forced "at most one active deck per user".
-- Allows the user to keep several decks in `active` status simultaneously and
-- removes any creation-time interference from the constraint.

drop index if exists public.decks_one_active_per_user_idx;
