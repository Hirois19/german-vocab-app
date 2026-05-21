# 0006. Row Level Security on every user table from the first migration

- Status: Accepted
- Date: 2026-05-21

## Context

Supabase exposes Postgres directly through a public REST and Realtime API. The
`anon` API key is embedded in the shipped client and is therefore public by
definition. Without Row Level Security (RLS), anyone holding that key can read
and write every row in every table, regardless of what the app's own code does.

RLS can be added at any time. The risk is timing: adding it late means auditing
every existing table, every policy, and every row already in production, under
pressure, after a window where data was exposed.

## Decision

Enable RLS on every user-data table in the second migration (`0002_rls.sql`),
alongside the initial schema, before any real data exists. The policy model is:

- **`cards`** — RLS enabled, with a policy allowing public read. It is the
  shared dictionary and holds no personal data. It is never written from the
  client.
- **`decks`, `user_cards`, `reviews`, `user_settings`** — RLS enabled,
  owner-only. Every policy is `auth.uid() = user_id`, so a user can only see and
  change their own rows.

"Deny by default" is the baseline. A new table is unreachable until a policy is
written for it.

## Consequences

- Every new user-data table must ship its RLS policy in the same migration that
  creates it. This is a fixed rule for the project.
- The seed script loads the shared dictionary with the `service_role` key, which
  bypasses RLS by design. That key is used only by server-side seeding and is
  never shipped in the app.
- Developers and tests must be authenticated to see their own data; an
  unauthenticated client correctly sees nothing in the user tables.
- Realtime subscriptions inherit RLS, so a user's device only receives change
  events for their own rows.

## Alternatives considered

- **Add RLS just before launch.** Rejected: it leaves a window where the schema
  exists without protection, and it turns security into a last-minute audit
  instead of a default.
- **Application-layer authorization only.** Rejected: the Supabase API is
  reachable directly with the public `anon` key, completely bypassing the app's
  code. A single missed check would expose all users' data. RLS enforces access
  in the database itself, where it cannot be bypassed.
