# 0011. Random card order

- Status: Accepted
- Date: 2026-11-11

## Context

Deck creation took the first W cards of the chosen levels in canonical_key
order, so a deck was an alphabetical slice of the dictionary. Triage and the
daily batches both follow `user_cards.position`, so every day showed words that
started with the same few letters, and the words outside the first W (for
A1+A2, everything after the letter "K" or so) were never offered.

## Decision

- `createMainDeck` fetches the complete pool of the chosen levels (paging past
  the 1000-row API cap) and shuffles it with a Fisher-Yates shuffle before
  taking the first W. The deck is a random sample and positions follow the
  random order.
- `topUpDeck` shuffles the cards it appends (ADR 0010).
- The SEKI schedule is unchanged. Day batches are still the position-based
  slice [wordStart, wordEnd] of the effective deck, identical in all 7 cycles,
  so every word keeps its exact 7-day interval.
- The order inside a session is shuffled with a PRNG seeded from (deck id,
  current day) (`sessionOrder` in `lib/seki/shuffle.ts`). Reopening or resuming
  a day gives the same order, and the same batch is presented in a different
  order on day N and on day N+7. Resume still skips cards already rated that
  day by id, so the order does not affect which cards are shown.
- Pending "stragglers" prepended to a batch (legacy progressive decks) stay as
  they were: they are part of the batch and are shuffled with it.

The shuffle helper takes an injectable random source, so it is unit-tested with
a seeded generator.

## Consequences

- Words are no longer grouped by spelling in triage or in a day's batch.
- Decks created before this change keep their alphabetical positions. Only new
  decks and cards added by a top-up are random.
- The pool is no longer capped at 2000 cards; a deck over all levels fetches the
  whole dictionary (about 2,500 rows) once at creation.

## Alternatives considered

- **Reshuffle the whole deck every cycle.** Rejected: it breaks the fixed 7-day
  interval that defines the SEKI schedule. A word's gap between two cycles
  would vary between 1 and 13 days.
- **Sort by a random key in the database.** Rejected: the shuffle needs to be
  testable and the pool is small enough to shuffle on the client.
