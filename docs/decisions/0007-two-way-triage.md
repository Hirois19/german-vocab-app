# 0007. Triage is a two-way choice

- Status: Accepted
- Date: 2026-07-29

## Context

Triage is the step that keeps words the learner already knows out of a deck.
It shipped with three buttons: 完全にわかる (`known_fully`), 知っている
(`known`), 知らない (`unknown`).

In the code the two "known" variants were never distinguished. `isPreKnown`
treats them the same, `occupiesDeckSlot` treats them the same, the mastered tab
counts them together, and `lib/stats/aggregate.ts` folds them into one bucket.
Nothing reads the difference, so the extra button bought a distinction the app
never used while asking the learner for a finer judgement on every card. Over a
700-word bulk triage that cost is paid hundreds of times.

Note that this is the triage scale, not the review rating. The three-level
YES / HALF / NO rating from ADR 0002 is unchanged: there the middle option
does drive the weak-card rule.

## Decision

Triage presents two buttons, in the triage screen and in the inline triage
during a session:

- 知っている → `triage_status = 'known'` (archived as pre-known)
- 知らない → `triage_status = 'unknown'` (enters the active SEKI deck)

`TriageButton` is narrowed to `'known' | 'unknown'`, so the UI can no longer
produce `known_fully`. `TriageStatus` keeps the value: rows triaged before this
change still carry it, and every predicate already handles it.

## Consequences

- One fewer decision per card, on the screen where the learner faces the most
  cards in a row.
- `known_fully` becomes a legacy value: written by no code path, still read
  correctly. A unit test pins that behaviour so a future cleanup does not
  silently drop those rows out of the pre-known set.
- If a real use for "I know this cold" appears later (for example, skipping a
  word in every future deck rather than just this one), it needs its own
  concept rather than a resurrected third button.

## Alternatives considered

- **Keep three buttons and give `known_fully` a meaning.** Rejected: no such
  behaviour was asked for, and inventing one to justify an existing button is
  backwards.
- **Migrate existing `known_fully` rows to `known`.** Rejected: the rows are
  already handled correctly everywhere, so a data migration would only trade a
  harmless legacy value for migration risk.
