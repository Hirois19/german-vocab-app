/**
 * Durable mutation outbox for offline-tolerant writes.
 *
 * When a Supabase write fails because the device is offline, the intended
 * mutation is appended here instead of being lost. The sync engine
 * (`syncEngine.ts`) drains the outbox once connectivity returns.
 *
 * Storage: a single AsyncStorage key holding a JSON array. The write volume of
 * a review session is tiny (a few dozen small records), so a key-value blob is
 * more than adequate — a full SQLite mirror would be over-engineering here.
 * See ADR 0004.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'german-vocab-app:outbox:v1';

export type MutationKind =
  | 'upsertReview'
  | 'incrementNoCount'
  | 'updateTriage'
  | 'advanceDeckDay'
  | 'setUserCardTags';

export interface OutboxMutation {
  /** Unique id; also used as an idempotency key. */
  id: string;
  kind: MutationKind;
  payload: unknown;
  createdAt: string;
  /** How many times the sync engine has failed to apply this mutation. */
  attempts: number;
}

// All read-modify-write access is serialized through this promise chain so a
// fast review session enqueuing several mutations in quick succession cannot
// clobber the stored array.
let lock: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = lock.then(fn, fn);
  lock = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

// Lightweight change notification so the sync UI can reflect the pending count
// the moment a mutation is queued, without polling.
const listeners = new Set<() => void>();
export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function notifyChanged(): void {
  for (const l of listeners) l();
}

async function readAll(): Promise<OutboxMutation[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxMutation[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(items: OutboxMutation[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function enqueue(kind: MutationKind, payload: unknown): Promise<OutboxMutation> {
  return withLock(async () => {
    const items = await readAll();
    const mutation: OutboxMutation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      kind,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    items.push(mutation);
    await writeAll(items);
    notifyChanged();
    return mutation;
  });
}

/** All queued mutations, oldest first (FIFO order is preserved). */
export function listOutbox(): Promise<OutboxMutation[]> {
  return withLock(readAll);
}

export function removeFromOutbox(id: string): Promise<void> {
  return withLock(async () => {
    const items = await readAll();
    await writeAll(items.filter((m) => m.id !== id));
    notifyChanged();
  });
}

export function bumpAttempts(id: string): Promise<void> {
  return withLock(async () => {
    const items = await readAll();
    await writeAll(items.map((m) => (m.id === id ? { ...m, attempts: m.attempts + 1 } : m)));
  });
}

export function countOutbox(): Promise<number> {
  return withLock(async () => (await readAll()).length);
}

export function clearOutbox(): Promise<void> {
  return withLock(async () => {
    await writeAll([]);
    notifyChanged();
  });
}
