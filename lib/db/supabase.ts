/**
 * Supabase client singleton for the React Native app.
 *
 * Storage handling:
 *   - Native (iOS / Android): AsyncStorage
 *   - Web (browser):          window.localStorage via a thin wrapper
 *   - Web (SSR / build-time): a memory stub so module load does not crash when
 *     `window` is undefined.
 *
 * The SSR guard exists because some bundling paths import the Supabase client
 * at module load time (e.g., AuthProvider context), and AsyncStorage's web
 * shim touches `window` eagerly. See:
 *   https://github.com/supabase/supabase-js/issues/870
 */

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY not set. ' +
      'App will start but DB calls will fail. Add them to .env.',
  );
}

const memoryStorage: SupportedStorage = (() => {
  const store = new Map<string, string>();
  return {
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => {
      store.set(k, v);
    },
    removeItem: async (k) => {
      store.delete(k);
    },
  };
})();

function pickStorage(): SupportedStorage {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return memoryStorage;
    return window.localStorage as unknown as SupportedStorage;
  }
  return AsyncStorage as unknown as SupportedStorage;
}

export const supabase = createClient(supabaseUrl ?? 'http://localhost', supabaseAnonKey ?? 'anon', {
  auth: {
    storage: pickStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
