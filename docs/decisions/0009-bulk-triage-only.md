# 0009. Bulk triage only

- Status: Accepted
- Date: 2026-07-30

## Context

A deck could be created in one of two triage modes:

- **bulk**: the candidate pool is triaged up front, before the deck activates.
- **progressive**: the whole level pool is provisioned as `pending` and each
  card is triaged inline the first time it appears in cycle 1. Known words drop
  out and later candidates shift forward to replace them.

Progressive mode cost more than it returned. It mixes two different activities
in one screen: judging "do I know this word" and reviewing the words already in
the deck. It also makes the deck's contents indeterminate until well into cycle
1, which makes the day counter and the batch sizes harder to reason about, and
it is the only reason `sessionBatch` has to carry "stragglers" between batches.

Bulk triage keeps the two activities apart: decide the deck's contents, then
learn them.

## Decision

New decks are always created in bulk mode. The mode selector is gone from the
New deck screen and `CreateMainDeckInput` no longer takes a `triageMode`.

Nothing is removed from the data model or the schedule logic:

- The `decks.triage_mode` column and its check constraint stay. Decks created
  before this ADR keep their value.
- `TriageMode` keeps `'progressive'`, marked legacy.
- The session screen keeps its inline triage UI, and `sessionBatch` keeps the
  straggler carry-over. Three of the author's decks were mid-flight in
  progressive mode when this was decided, holding 574, 527 and 262 untriaged
  cards between them. Removing the inline path would have stranded those cards
  with no way to resolve them.

## Consequences

- One less decision when creating a deck, and a deck whose contents are settled
  before day 1.
- The inline triage branch in `app/decks/[id]/session.tsx` is now reachable only
  by pre-existing decks. It should be deleted once those decks finish their 49
  days, along with the straggler logic in `sessionBatch` and the legacy union
  member.
- Provisioning is simpler: `createMainDeck` always fetches a buffer over W
  rather than branching to the whole pool.

## Alternatives considered

- **Delete progressive support outright, including the inline UI.** Rejected
  for now: it would leave in-flight decks unfinishable. Worth revisiting once
  they complete.
- **Migrate existing progressive decks to bulk.** Rejected: flipping the column
  would not triage the cards, so those decks would still meet pending cards in
  a session, only now without a mode that explains why.
