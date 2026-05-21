/**
 * Subscribe to Supabase Realtime broadcasts for the current user's tables.
 *
 * Usage:
 *   useUserChanges(user?.id ?? null, refresh);
 *
 * When any row owned by the user changes (insert / update / delete) on the
 * server, the `onChange` callback fires. The screen's existing refresh
 * function can then re-fetch state, picking up changes from another device.
 *
 * The channel is keyed on the user id and re-established only when the id
 * changes — onChange identity is captured by ref so re-renders do not
 * tear down the subscription.
 *
 * Realtime requires the tables to be in the `supabase_realtime` publication;
 * see `supabase/migrations/0004_realtime.sql`.
 */

import { useEffect, useRef } from 'react';

import { supabase } from '@/lib/db/supabase';

type ChangeHandler = () => void;

const WATCHED_TABLES = [
  'decks',
  'user_cards',
  'reviews',
  'tags',
  'card_tags',
  'user_settings',
] as const;

export function useUserChanges(userId: string | null, onChange: ChangeHandler): void {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!userId) return;
    // Each hook instance gets a unique channel so multiple screens subscribing
    // for the same user don't share (and break) the same channel object.
    const channelName = `user-changes-${userId}-${Math.random().toString(36).slice(2)}`;
    let channel = supabase.channel(channelName);
    for (const table of WATCHED_TABLES) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `user_id=eq.${userId}`,
        },
        () => onChangeRef.current(),
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}
