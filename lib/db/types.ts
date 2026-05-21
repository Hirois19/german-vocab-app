/**
 * Hand-written DB row types, mirroring the schema in
 * `supabase/migrations/0001_init.sql`.
 *
 * When the schema changes, update both files together. We could switch to
 * Supabase-generated types via `supabase gen types typescript`; this is the
 * lighter-weight alternative used until the CLI is added.
 */

import type {
  CefrLevel,
  DeckKind,
  DeckStatus,
  Rating,
  TriageMode,
  TriageStatus,
} from '../seki/types';

export interface CardRow {
  id: string;
  canonical_key: string;
  term_de: string;
  article: 'der' | 'die' | 'das' | null;
  pos: string | null;
  translations_ja: string[];
  translations_en: string[];
  examples: string[];
  prateritum: string | null;
  partizip_ii: string | null;
  plural: string | null;
  notes: string[];
  levels: CefrLevel[];
  sources: string[];
  /** Pre-computed theme categories (e.g., 'Essen', 'Reisen'). See migration 0005. */
  categories: string[];
  created_at: string;
}

export interface DeckRow {
  id: string;
  user_id: string;
  name: string;
  kind: DeckKind;
  parent_deck_id: string | null;
  word_count_per_week: number;
  current_day: number;
  status: DeckStatus;
  triage_mode: TriageMode;
  start_date: string | null;
  last_session_date: string | null;
  created_at: string;
}

export interface UserCardRow {
  id: string;
  user_id: string;
  deck_id: string;
  card_id: string;
  position: number;
  triage_status: TriageStatus;
  is_mastered: boolean;
  is_weak: boolean;
  no_count: number;
  /**
   * Editable per-user-card tag overlay. Initialized from cards.categories
   * (source-data themes/POS/level) at deck creation. See migration 0007.
   */
  tags: string[];
  created_at: string;
}

export interface ReviewRow {
  id: string;
  user_card_id: string;
  user_id: string;
  cycle: number;
  batch: number;
  day: number;
  rating: Rating;
  reviewed_at: string;
}

export interface UserSettingsRow {
  user_id: string;
  weak_threshold_n: number;
  default_word_count_per_week: number;
  ui_language: 'ja' | 'en';
  updated_at: string;
}
