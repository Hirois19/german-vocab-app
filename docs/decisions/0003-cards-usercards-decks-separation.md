# 0003. Separate the dictionary, decks, and per-card study state

- Status: Accepted
- Date: 2026-05-21

## Context

The app has two kinds of data that look similar but behave very differently:

- the German dictionary (term, article, translations, examples, level, theme
  categories), which is the same for everyone, and
- each learner's study state (which deck a word is in, its triage status, its
  position, its review history, its tags).

A naive schema would put everything on one "cards" table. That breaks as soon as
the same dictionary word needs to exist in more than one of a user's decks, or
as soon as a second user joins.

## Decision

Use four tables with distinct ownership:

- **`cards`** — the shared dictionary. World-readable, never written from the
  client. One row per unique word.
- **`decks`** — per-user deck configuration and progress (W, current day,
  status, triage mode, kind).
- **`user_cards`** — per-user, per-deck card state: which `card` it points to,
  triage status, position, mastery and weak flags, and the editable tag list.
- **`reviews`** — the event log: one row per (user_card, cycle) with the rating.

The same dictionary `card` can be referenced by many `user_cards` across a
user's main deck and weak decks, each with independent state.

## Consequences

- The dictionary is immutable from the client, so it can be cached aggressively
  on device (see ADR 0004) and shared across all users without duplication.
- Row Level Security is simple to express: `cards` is public read, every other
  table is owner-only (see ADR 0006).
- Reads join across tables. The repository layer in `lib/db/` hides the joins,
  and bulk fetches (`listCardsByIds`) avoid N+1 queries.
- Statistics that need word attributes (part of speech, article, level) join
  `reviews` to `user_cards` to `cards`. This is the expected cost of
  normalization and is acceptable at this data scale.

## Alternatives considered

- **One table per user with the dictionary embedded.** Rejected: the ~2,500-word
  dictionary would be copied into every user's rows, there would be no sharing,
  and a dictionary correction would have to be rewritten everywhere.
- **Store study state on the `cards` table.** Rejected: it makes `cards`
  user-specific, which blocks sharing, blocks the same word appearing in two
  decks, and forces RLS onto what should be a public table.
