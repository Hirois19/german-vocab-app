# 0008. Review rating is a two-way choice

- Status: Accepted
- Date: 2026-07-30
- Supersedes: the rating-scale section of ADR 0002

## Context

ADR 0002 set the review rating at three levels, YES / HALF / NO, on the
argument that "inferred it" is a genuinely different state from "knew it" and
from "missed it". The weak-card rule used HALF in one place: a card whose
cycle-7 rating was NO **or HALF** is flagged weak.

In use the middle option turned out to cost more than it returned. Every card
in a 100-word batch asks for a three-way judgement, and the boundary between
"knew it" and "inferred it" is the fuzziest of the three, so it is the slowest
call to make and the least consistent from day to day. ADR 0007 removed the
same kind of middle option from triage for the same reason.

## Decision

The session's rating row offers two buttons:

- YES: recalled it.
- NO: did not.

`RatingButton` (`'YES' | 'NO'`) is what the UI produces. `Rating` keeps
`'HALF'` because the enum value exists in the database and reviews written
before this change still carry it.

The weak rule in `lib/seki/weakDeck.ts` is unchanged. Its second condition
still reads "final cycle rating is NO or HALF"; for ratings written from now
on the HALF arm can never fire, so the condition reduces to "final cycle was
NO". Older decks keep evaluating exactly as they did.

## Consequences

- The weak rule gets slightly stricter for new decks. A card that would have
  been rated HALF in the final cycle, and flagged weak for it, now depends on
  which way the learner calls it: YES excludes it, NO flags it. The NO-count
  arm (default `N = 5`) is unaffected.
- The Progress tab's HALF legend and HALF-rate line are shown only when the
  data actually contains HALF rows, so older decks stay readable while new
  ones are not padded with a permanent zero.
- Aggregation in `lib/stats/aggregate.ts` still counts three buckets. That is
  deliberate: it is what makes the historical decks render correctly.

## Alternatives considered

- **Rewrite existing HALF rows to YES or NO.** Rejected: it would falsify past
  self-assessments, and there is no honest mapping. HALF meant neither.
- **Keep HALF but hide it behind a setting.** Rejected: a rating scale that
  differs per user makes the weak rule mean different things for different
  decks, for no clear gain.
