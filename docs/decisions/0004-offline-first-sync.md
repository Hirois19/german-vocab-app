# 0004. Offline writes via a mutation outbox, not a full SQLite mirror

- Status: Accepted
- Date: 2026-05-21

## Context

This is a mobile app for daily study. Connectivity drops on trains, in
basements, and in airplane mode. A review session must not fail or lose data
when the network goes away mid-session.

The original design plan named `expo-sqlite` plus a sync queue. Before
implementing, the actual offline workload was examined:

- Writes per session: a few dozen small records (one review per card, an
  occasional NO-count bump, one day advance).
- Offline read set: one deck and its cards. The shared dictionary is already
  cached separately.

There is no need for complex local queries over a large dataset.

## Decision

Implement offline support as a **mutation outbox** (`lib/sync/`):

- Every user-data write goes through a queue-aware wrapper. It tries Supabase
  first. On a connectivity failure the mutation is appended to a durable outbox
  and an optimistic result is returned so the session UI continues.
- The outbox is a single AsyncStorage key holding a JSON array of mutations.
- A sync engine drains the outbox in FIFO order when connectivity returns
  (browser `online` event, app foreground, or a slow interval backstop).
- For reads, the shared dictionary is cached, and the active session is
  snapshotted so a session can be started while offline.

This diverges from the plan's `expo-sqlite` choice. AsyncStorage was chosen
because the write volume is tiny and the offline read set is small. A full
SQLite mirror with bidirectional sync would add significant complexity with no
benefit at this scale. SQLite would be the right tool if the app needed to
mirror the whole dictionary for rich offline queries; it does not.

## Consequences

- Writes never block or fail the UI when offline.
- `advanceDeckDay` is made idempotent for replay: the queued mutation records
  the day it was issued from, and the sync engine only advances if the deck is
  still on that day. An at-least-once replay is therefore safe.
- `incrementNoCount` is not idempotent. The only double-apply window is a crash
  between the server acknowledging the write and the mutation being removed from
  the outbox. For a single-user study app this rare off-by-one is accepted.
- AsyncStorage is not transactional, so outbox access is serialized through an
  in-process promise chain to avoid lost updates during a fast session.
- A poison mutation (one that keeps failing with a real server error, not a
  network error) is dropped after 8 attempts so it cannot block the queue.

## Alternatives considered

- **Full `expo-sqlite` mirror.** Rejected as over-engineering for the data
  volume, and its web support is immature, which would complicate the portfolio
  web build.
- **Online-only with retry.** Rejected: a retry buffer held only in memory loses
  data if the app is closed while offline.
- **No offline support.** Rejected: unacceptable for a commute-time study app.
