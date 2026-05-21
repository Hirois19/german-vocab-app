# 0001. SEKI 7×7 fixed schedule over adaptive SRS (FSRS, SM-2)

- Status: Accepted
- Date: 2026-05-21

## Context

The app needs a review-scheduling algorithm. The default choice in the
flashcard space is adaptive spaced repetition: SM-2 (the Anki algorithm) or the
newer FSRS. Both give every card its own due date based on how well the user
recalled it, so easy cards drift far apart and hard cards stay close.

This project instead follows the SEKI 7×7 method, a fixed-schedule study
technique: a set of W words is split into 7 daily batches, each batch is
studied once per 7-day cycle, and the cycle repeats 7 times. Every word is
reviewed exactly 7 times over 49 sessions.

## Decision

Use the SEKI 7×7 fixed schedule as the only scheduling engine. The scheduler is
a set of pure functions in `lib/seki/scheduler.ts`:

- Batch size `B = ceil(W / 7)`.
- Day `d` (1..49) maps to cycle `ceil(d / 7)` and batch `((d-1) mod 7) + 1`.
- The day counter is session-based, not calendar-based: a missed day does not
  advance the schedule, so the user resumes from the same day.

Difficulty adaptation is not abandoned. It is handled at a coarser grain by the
weak-deck mechanism (see ADR 0002): words the user keeps missing are pooled into
a new deck that runs its own 49-day SEKI cycle.

## Consequences

- The scheduler is about 100 lines of pure functions with no per-card state, so
  it is fully unit-tested and trivial to reason about.
- A deck always completes in exactly 49 sessions. The user knows today's task
  before opening the app, and daily load is constant.
- There is no per-card due date, ease factor, or interval to store, tune, or
  migrate.
- The cost: the schedule does not react to a single card's difficulty within a
  deck. A word the user already knows still gets 7 reviews unless it is removed
  during triage (see ADR 0002 for triage and weak decks).

## Alternatives considered

- **FSRS.** Accurate and well-researched, but every card carries its own due
  date. Daily review load becomes unpredictable, and the model is opaque to the
  learner. The fixed schedule was a deliberate product choice for predictability.
- **SM-2 / Anki.** Same per-card due-date problem, plus the well-known failure
  mode where a lapsed card's ease factor collapses and it reappears constantly.
- **No schedule (free review).** Rejected: it gives the learner no structure,
  which is the main thing the SEKI method provides.
