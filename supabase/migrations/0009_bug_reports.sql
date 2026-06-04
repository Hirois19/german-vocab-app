-- 0009_bug_reports.sql
-- In-app bug reports: a user can tap a floating button on any screen and
-- describe what went wrong. The user owns their tickets; the service role
-- (used by the developer / Claude) reads them all to triage and fix.

create table if not exists public.bug_reports (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users on delete cascade,
  created_at   timestamptz not null default now(),
  description  text        not null,
  -- Free-form context: screen route, current deck id, app version, etc.
  -- Captured by the client at submit time. Keeps the schema stable while the
  -- set of useful context fields evolves.
  context      jsonb,
  status       text        not null default 'open'
                  check (status in ('open', 'reviewing', 'fixing', 'fixed', 'wontfix', 'duplicate')),
  -- Filled in by the developer / Claude when the ticket is resolved.
  resolution_note text
);

create index if not exists bug_reports_user_id_idx on public.bug_reports (user_id);
create index if not exists bug_reports_status_idx  on public.bug_reports (status);
create index if not exists bug_reports_created_at_idx on public.bug_reports (created_at desc);

alter table public.bug_reports enable row level security;

create policy "bug_reports_owner_select"
  on public.bug_reports for select
  using (auth.uid() = user_id);

create policy "bug_reports_owner_insert"
  on public.bug_reports for insert
  with check (auth.uid() = user_id);

-- The user can mark their own ticket as 'fixed' or add a resolution_note,
-- e.g. "I figured it out, never mind." The service role bypasses RLS for
-- developer-side triage.
create policy "bug_reports_owner_update"
  on public.bug_reports for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "bug_reports_owner_delete"
  on public.bug_reports for delete
  using (auth.uid() = user_id);
