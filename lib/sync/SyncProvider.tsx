/**
 * SyncProvider — owns the outbox drain lifecycle and exposes sync state to the
 * UI (a pending-mutation count and a "syncing" flag for the status badge).
 *
 * Drains are triggered on mount, on reconnect (browser `online` event or app
 * foreground), and on a slow interval as a backstop. The pending count also
 * updates immediately whenever a mutation is enqueued, via the outbox's own
 * change notification.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { onReconnect } from './connectivity';
import { countOutbox, subscribeOutbox } from './outbox';
import { drainOutbox } from './syncEngine';

interface SyncState {
  /** Mutations waiting to be synced. */
  pending: number;
  /** A drain is currently in flight. */
  syncing: boolean;
  /** Trigger a drain manually (e.g. a "retry" tap). */
  syncNow: () => void;
}

const SyncContext = createContext<SyncState>({
  pending: 0,
  syncing: false,
  syncNow: () => {},
});

export function useSync(): SyncState {
  return useContext(SyncContext);
}

/** Backstop drain interval (ms) in case no reconnect event fires. */
const DRAIN_INTERVAL_MS = 30_000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const mounted = useRef(true);

  const refreshCount = useCallback(async () => {
    const n = await countOutbox();
    if (mounted.current) setPending(n);
  }, []);

  const sync = useCallback(async () => {
    if (mounted.current) setSyncing(true);
    try {
      await drainOutbox();
    } finally {
      if (mounted.current) setSyncing(false);
      await refreshCount();
    }
  }, [refreshCount]);

  useEffect(() => {
    mounted.current = true;
    void sync();
    const offReconnect = onReconnect(() => void sync());
    const offOutbox = subscribeOutbox(() => void refreshCount());
    const interval = setInterval(() => void sync(), DRAIN_INTERVAL_MS);
    return () => {
      mounted.current = false;
      offReconnect();
      offOutbox();
      clearInterval(interval);
    };
  }, [sync, refreshCount]);

  return (
    <SyncContext.Provider value={{ pending, syncing, syncNow: () => void sync() }}>
      {children}
    </SyncContext.Provider>
  );
}
