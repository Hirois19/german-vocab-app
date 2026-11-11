# 0010. Deck level top-up

- Status: Accepted
- Date: 2026-11-11

## Context

Deck creation took the cards of the chosen CEFR levels in canonical_key order
and provisioned only the first W (`word_count_per_week`, for example 700). Bulk
triage (ADR 0009) calls an expansion step when every provisioned card is
triaged but the "unknown" count is still below W.

The first version of that step had two defects:

- It never added the rest of the chosen levels. With A1+A2 (1,186 cards) and
  W=700, the other 486 cards were skipped and B1 was added instead.
- It derived the covered levels from the `levels` arrays of the cards in the
  deck. A few homonym cards carry several levels (`arm` is ['B1','A1'], `stolz`
  is ['A2','B2']). `arm` is in every A1+A2 deck, so B1 counted as covered and
  the expansion jumped to B2.

## Decision

When triage runs out of pending cards with fewer than W unknowns, the deck is
topped up in two steps:

1. Add the cards of the levels chosen at deck creation that are not in the deck
   yet, after the current maximum position, as `pending`. They are shuffled
   before they are appended (ADR 0011).
2. Only when none remain, add the next level: the lowest level above the highest
   level the deck has covered (A1 < A2 < B1 < B2 < C1 < C2). If no higher level
   has cards left, fall back to the uncovered lower levels in ascending order.
   If nothing is left, nothing is added and triage finishes as before.

Covered levels are stored on the deck: a nullable `levels text[]` column on
`decks` (migration 0012). `createMainDeck` writes the chosen levels in
pedagogical order, and step 2 appends the level it adds.

Decks created before the migration have `levels = NULL`. Their levels are
inferred once from the cards in the deck and saved. A level counts as covered
only when at least 5 deck cards carry it, so a handful of multi-level homonym
cards cannot mark a level as covered. Using each card's lowest level instead
would be wrong for the same reason: a B1 deck containing `arm` would look like
A1.

The level selection lives in pure functions in `lib/seki/levels.ts`
(`inferCoveredLevels`, `nextLevelCandidates`, `pickNextLevel`), unit-tested.
The database side is `topUpDeck` in `lib/db/deckBuilder.ts`, which replaces
`expandDeckToNextLevel` and returns which of the two cases happened so the
triage screen can word its notification.

## Consequences

- A deck gets every card of its chosen levels before it reaches into a level
  the user did not pick.
- Expansion no longer depends on tags that were never meant to describe deck
  membership.
- The inference threshold of 5 is a heuristic. A legacy deck with fewer than 5
  cards of a real level would not count that level as covered.
- Fetching the full pool of a level pages through the API, which caps a request
  at 1000 rows. The old single request for 5000 rows was silently cut to 1000.

## Alternatives considered

- **Keep deriving covered levels from card tags and exclude known homonyms.**
  Rejected: the list of multi-level cards is data, not a rule, and changes with
  each dictionary update.
- **Use each card's lowest level.** Rejected: a B1 deck containing `arm` would
  look like it covers A1.
- **Provision every card of the chosen levels at creation.** Rejected: triage
  would then start with thousands of pending cards, and the day counter and
  batch sizes are built around a deck of about W cards.
