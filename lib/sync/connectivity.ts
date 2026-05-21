/**
 * Connectivity helpers for the offline sync layer.
 *
 * We deliberately avoid a dedicated native NetInfo dependency. Offline is
 * detected from write failures (`isOfflineError`); reconnection is observed
 * via the browser `online` event on web and AppState foreground transitions
 * on native. This keeps the dependency surface small and works identically
 * on web, iOS and Android.
 */

import { AppState } from 'react-native';

/**
 * Best-effort "are we online" check. On web this reflects `navigator.onLine`;
 * on native there is no cheap synchronous signal so we assume online and let
 * the actual request failure tell us otherwise.
 */
export function isLikelyOnline(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

const NETWORK_ERROR_PATTERNS = [
  'failed to fetch',
  'network request failed',
  'networkerror',
  'network error',
  'load failed',
  'fetch failed',
  'err_internet_disconnected',
  'err_network',
  'err_connection',
  'aborterror',
  'timeout',
];

/**
 * Whether an error thrown by a Supabase call looks like a connectivity
 * failure (as opposed to a real 4xx/5xx the server returned).
 */
export function isOfflineError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const lower = msg.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Subscribe to "we might be back online" signals. Fires on the browser
 * `online` event and whenever the app returns to the foreground. Returns an
 * unsubscribe function.
 */
export function onReconnect(handler: () => void): () => void {
  const unsubs: (() => void)[] = [];

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const onOnline = () => handler();
    window.addEventListener('online', onOnline);
    unsubs.push(() => window.removeEventListener('online', onOnline));
  }

  const appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') handler();
  });
  unsubs.push(() => appStateSub.remove());

  return () => unsubs.forEach((u) => u());
}
