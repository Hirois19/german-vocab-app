# 0002. Weak-card detection rule and the 苦手デッキ loop

- Status: Accepted
- Date: 2026-05-21

## Context

The SEKI schedule (ADR 0001) reviews every word a fixed 7 times and does not
adapt to a single card's difficulty. Difficulty has to be handled somewhere,
otherwise a learner finishes a 49-day deck with no follow-up on the words they
never really learned.

Two design questions had to be answered:

1. What counts as a "weak" word after a deck completes?
2. What happens to those weak words?

## Decision

**Rating scale.** Each review is rated on three levels, not Anki's four:

- YES: fully recalled.
- HALF: meaning inferred from context, but not solid.
- NO: wrong or blank.

Three levels keep self-assessment fast and honest. The middle option exists
because "inferred it" is a genuinely different state from "knew it" and from
"missed it".

**Weak rule.** After a deck reaches day 49, `isWeakCard` in
`lib/seki/weakDeck.ts` flags a card as weak when either condition holds:

- the card was rated NO in at least `N` of its 7 cycles (default `N = 5`), or
- the final-cycle (cycle 7) rating was NO or HALF.

The first condition is a frequency signal: a word missed in most cycles was
never learned. The second is a recency signal: a word still shaky on the last
pass has not stuck, even if earlier cycles went well. A card needs only one of
the two to be weak. `N = 5` was chosen as "missed more than half of the 7
reviews"; it is exposed in user settings.

**The loop.** Weak words from any completed deck collect in a weak pool. When
the pool reaches W words, a new 苦手デッキ (weak deck) is formed and runs its own
49-day SEKI cycle. A weak deck can itself produce weak words, so the loop can
recurse. To stop a word cycling forever, the user has a manual "mark as
mastered" action that retires it.

## Consequences

- `isWeakCard` is a pure function over a card's per-cycle rating history, so it
  is unit-tested across the boundary cases (5 NOs, final HALF, final NO,
  neither).
- Difficulty adaptation happens at deck granularity, which fits the fixed-schedule
  model: a weak deck is just another SEKI deck.
- The recursion needs a human escape hatch. Without the manual mastered action,
  a stubborn word could reappear in weak deck after weak deck.

## Alternatives considered

- **Final-cycle rating only.** Rejected: a learner who guessed well on the last
  pass would hide a word they missed five times.
- **NO count only.** Rejected: a word that was shaky throughout and still shaky
  at the end, but never a hard NO, would escape.
- **Anki-style 4-button rating.** Rejected: the extra button adds decision cost
  every card without changing the weak rule in a meaningful way.
