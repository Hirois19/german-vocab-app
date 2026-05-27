import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { prefetchCards } from '@/lib/cache/cardsCache';
import { supabase } from '@/lib/db/supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  /** Send a password-reset email with a link back to the in-app reset page. */
  resetPasswordForEmail: (email: string) => Promise<{ error: Error | null }>;
  /** Set a new password for the currently authenticated user (post-reset). */
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Once authenticated, refresh the local cards cache in the background.
  // Failures are not fatal — listCardsByIdsCached falls back to Supabase.
  useEffect(() => {
    if (!session?.user) return;
    prefetchCards().catch((err) => {
      console.warn('[auth] cards prefetch failed:', err);
    });
  }, [session?.user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signUp: async (email, password) => {
        const { error } = await supabase.auth.signUp({ email, password });
        return { error };
      },
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      resetPasswordForEmail: async (email) => {
        // On web the reset email links the user back to this same origin's
        // /reset-password page. On native the user opens the in-app deep link
        // (configured separately via Linking; for the MVP we fall back to web).
        const redirectTo =
          Platform.OS === 'web' && typeof window !== 'undefined'
            ? `${window.location.origin}/reset-password`
            : undefined;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        return { error };
      },
      updatePassword: async (newPassword) => {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        return { error };
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
