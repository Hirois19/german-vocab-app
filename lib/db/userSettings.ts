/**
 * Repository for `user_settings` — one row per authenticated user.
 *
 * Treated as a singleton per user: `getOrCreate` ensures the row exists
 * with default values on first read.
 */

import { supabase } from './supabase';
import type { UserSettingsRow } from './types';
import { DEFAULT_WEAK_THRESHOLD_N } from '../seki/weakDeck';

const TABLE = 'user_settings';

const DEFAULT_WORD_COUNT_PER_WEEK = 700;

export async function getOrCreate(userId: string): Promise<UserSettingsRow> {
  const { data: existing, error: readErr } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (existing) return existing as UserSettingsRow;

  const defaults = {
    user_id: userId,
    weak_threshold_n: DEFAULT_WEAK_THRESHOLD_N,
    default_word_count_per_week: DEFAULT_WORD_COUNT_PER_WEEK,
    ui_language: 'ja' as const,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from(TABLE).insert(defaults).select('*').single();
  if (error) throw error;
  return data as UserSettingsRow;
}

export interface UpdateUserSettingsInput {
  weakThresholdN?: number;
  defaultWordCountPerWeek?: number;
  uiLanguage?: 'ja' | 'en';
}

export async function update(
  userId: string,
  input: UpdateUserSettingsInput,
): Promise<UserSettingsRow> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.weakThresholdN !== undefined) patch.weak_threshold_n = input.weakThresholdN;
  if (input.defaultWordCountPerWeek !== undefined)
    patch.default_word_count_per_week = input.defaultWordCountPerWeek;
  if (input.uiLanguage !== undefined) patch.ui_language = input.uiLanguage;
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) throw error;
  return data as UserSettingsRow;
}
