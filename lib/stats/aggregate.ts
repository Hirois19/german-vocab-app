/**
 * Pure aggregation helpers for dashboard tabs. Each function takes raw rows
 * (reviews, user_cards, cards) and returns chart-ready data structures.
 *
 * No I/O here — these functions are unit-tested in `__tests__/aggregate.test.ts`.
 */

import { CYCLES_PER_DECK } from '../seki/scheduler';
import type { ReviewRow, UserCardRow, CardRow } from '../db/types';
import type { CefrLevel } from '../seki/types';

export interface CycleAggregate {
  cycle: number;
  yes: number;
  half: number;
  no: number;
  total: number;
}

/**
 * Count YES/HALF/NO ratings per cycle (1..7). Used by the Progress tab's
 * stacked bar chart.
 */
export function aggregateByCycle(reviews: readonly ReviewRow[]): CycleAggregate[] {
  const buckets: CycleAggregate[] = [];
  for (let c = 1; c <= CYCLES_PER_DECK; c += 1) {
    buckets.push({ cycle: c, yes: 0, half: 0, no: 0, total: 0 });
  }
  for (const r of reviews) {
    if (r.cycle < 1 || r.cycle > CYCLES_PER_DECK) continue;
    const b = buckets[r.cycle - 1]!;
    if (r.rating === 'YES') b.yes += 1;
    else if (r.rating === 'HALF') b.half += 1;
    else if (r.rating === 'NO') b.no += 1;
    b.total += 1;
  }
  return buckets;
}

export interface MasteredOverTimePoint {
  date: string; // ISO date (YYYY-MM-DD)
  cumulative: number;
}

/**
 * Build a cumulative time series of mastered words. Inputs:
 *   - user_cards with `is_mastered=true` and an effective "mastered-at" date.
 *
 * Since the schema doesn't yet have a `mastered_at` timestamp, we fall back to
 * `created_at` as a proxy and document the limitation. The series is sorted
 * ascending by date.
 */
export function aggregateMasteredOverTime(
  userCards: readonly UserCardRow[],
): MasteredOverTimePoint[] {
  const mastered = userCards.filter((c) => c.is_mastered);
  if (mastered.length === 0) return [];
  const byDate = new Map<string, number>();
  for (const c of mastered) {
    const d = c.created_at.slice(0, 10);
    byDate.set(d, (byDate.get(d) ?? 0) + 1);
  }
  const dates = Array.from(byDate.keys()).sort();
  let cumulative = 0;
  return dates.map((d) => {
    cumulative += byDate.get(d) ?? 0;
    return { date: d, cumulative };
  });
}

export interface LevelProgress {
  level: CefrLevel;
  /** Total cards at this level in the shared dictionary. */
  total: number;
  /** Distinct cards mastered or marked pre-known by the user. */
  known: number;
  /** Distinct cards currently being studied ('unknown', not yet mastered). */
  studying: number;
}

/**
 * Per-CEFR-level coverage of the dictionary.
 *
 * For each level, counts how many distinct cards the user has either learned
 * (mastered after a SEKI cycle, or triaged as pre-known) versus is currently
 * studying ('unknown' in a deck, not yet mastered). The same card can sit in
 * several decks, so cards are de-duplicated by `card_id`; the strongest status
 * wins (known > studying).
 *
 * @param userCards  Every user_card for the user, across all decks.
 * @param cardLevel  card_id → its CEFR level (single level per card).
 * @param levelTotals  level → total dictionary cards at that level.
 */
export function aggregateLevelProgress(
  userCards: readonly Pick<UserCardRow, 'card_id' | 'triage_status' | 'is_mastered'>[],
  cardLevel: ReadonlyMap<string, CefrLevel>,
  levelTotals: Readonly<Record<string, number>>,
): LevelProgress[] {
  // Resolve the strongest status per distinct card.
  type Status = 'known' | 'studying';
  const statusByCard = new Map<string, Status>();
  for (const uc of userCards) {
    const isKnown =
      uc.is_mastered || uc.triage_status === 'known' || uc.triage_status === 'known_fully';
    const isStudying = !uc.is_mastered && uc.triage_status === 'unknown';
    if (!isKnown && !isStudying) continue;
    const next: Status = isKnown ? 'known' : 'studying';
    const prev = statusByCard.get(uc.card_id);
    if (prev === 'known') continue; // 'known' already wins
    statusByCard.set(uc.card_id, next);
  }

  const known: Record<string, number> = {};
  const studying: Record<string, number> = {};
  for (const [cardId, status] of statusByCard) {
    const level = cardLevel.get(cardId);
    if (!level) continue;
    if (status === 'known') known[level] = (known[level] ?? 0) + 1;
    else studying[level] = (studying[level] ?? 0) + 1;
  }

  return Object.keys(levelTotals)
    .sort()
    .map((level) => ({
      level: level as CefrLevel,
      total: levelTotals[level] ?? 0,
      known: known[level] ?? 0,
      studying: studying[level] ?? 0,
    }));
}

export interface CategoryAggregate {
  category: string;
  yesRate: number;
  total: number;
}

/**
 * YES rate per part-of-speech (e.g., noun / verb / adj). Joins reviews to
 * user_cards to cards. Cards with no POS are bucketed under "(unknown)".
 */
export function aggregateByPos(
  reviews: readonly ReviewRow[],
  userCards: readonly UserCardRow[],
  cards: readonly CardRow[],
): CategoryAggregate[] {
  const ucById = new Map(userCards.map((u) => [u.id, u]));
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const counts = new Map<string, { yes: number; total: number }>();
  for (const r of reviews) {
    const uc = ucById.get(r.user_card_id);
    if (!uc) continue;
    const card = cardById.get(uc.card_id);
    const pos = card?.pos ?? '(unknown)';
    const bucket = counts.get(pos) ?? { yes: 0, total: 0 };
    if (r.rating === 'YES') bucket.yes += 1;
    bucket.total += 1;
    counts.set(pos, bucket);
  }
  return Array.from(counts.entries())
    .map(([category, { yes, total }]) => ({
      category,
      yesRate: total === 0 ? 0 : yes / total,
      total,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * YES rate per noun article (der/die/das). Cards without an article are
 * skipped (verbs/adjectives etc. don't have one).
 */
export function aggregateByArticle(
  reviews: readonly ReviewRow[],
  userCards: readonly UserCardRow[],
  cards: readonly CardRow[],
): CategoryAggregate[] {
  const ucById = new Map(userCards.map((u) => [u.id, u]));
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const counts = new Map<string, { yes: number; total: number }>();
  for (const r of reviews) {
    const uc = ucById.get(r.user_card_id);
    if (!uc) continue;
    const card = cardById.get(uc.card_id);
    const article = card?.article;
    if (!article) continue;
    const bucket = counts.get(article) ?? { yes: 0, total: 0 };
    if (r.rating === 'YES') bucket.yes += 1;
    bucket.total += 1;
    counts.set(article, bucket);
  }
  return (['der', 'die', 'das'] as const)
    .map((a) => {
      const b = counts.get(a) ?? { yes: 0, total: 0 };
      return { category: a, yesRate: b.total === 0 ? 0 : b.yes / b.total, total: b.total };
    })
    .filter((b) => b.total > 0);
}

export interface PeriodAggregate {
  /** ISO start of the period (Monday for weekly, 1st of month for monthly). */
  periodStart: string;
  reviewCount: number;
  yesRate: number;
}

/** Group reviews by ISO week (start = Monday). */
export function aggregateByWeek(reviews: readonly ReviewRow[]): PeriodAggregate[] {
  return aggregateByPeriod(reviews, weekStart);
}

/** Group reviews by calendar month. */
export function aggregateByMonth(reviews: readonly ReviewRow[]): PeriodAggregate[] {
  return aggregateByMonthsBucket(reviews, 1);
}

/**
 * Group reviews by N-month buckets aligned to the calendar.
 *   monthsPerBucket = 3  → quarters (Jan/Apr/Jul/Oct)
 *   monthsPerBucket = 6  → half-years (Jan/Jul)
 *   monthsPerBucket = 12 → calendar years (Jan only)
 */
export function aggregateByMonthsBucket(
  reviews: readonly ReviewRow[],
  monthsPerBucket: number,
): PeriodAggregate[] {
  if (!Number.isInteger(monthsPerBucket) || monthsPerBucket < 1) {
    throw new RangeError(`monthsPerBucket must be a positive integer, got ${monthsPerBucket}`);
  }
  return aggregateByPeriod(reviews, (d) => monthBucketStart(d, monthsPerBucket));
}

function aggregateByPeriod(
  reviews: readonly ReviewRow[],
  toStart: (d: Date) => string,
): PeriodAggregate[] {
  const counts = new Map<string, { yes: number; total: number }>();
  for (const r of reviews) {
    const d = new Date(r.reviewed_at);
    const key = toStart(d);
    const bucket = counts.get(key) ?? { yes: 0, total: 0 };
    if (r.rating === 'YES') bucket.yes += 1;
    bucket.total += 1;
    counts.set(key, bucket);
  }
  return Array.from(counts.entries())
    .map(([periodStart, { yes, total }]) => ({
      periodStart,
      reviewCount: total,
      yesRate: total === 0 ? 0 : yes / total,
    }))
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
}

function weekStart(d: Date): string {
  // ISO week starts Monday. JS getDay: 0=Sun..6=Sat → shift to 0=Mon..6=Sun.
  const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - day);
  return monday.toISOString().slice(0, 10);
}

function monthBucketStart(d: Date, monthsPerBucket: number): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0..11
  const bucketMonth = Math.floor(m / monthsPerBucket) * monthsPerBucket;
  return `${y}-${String(bucketMonth + 1).padStart(2, '0')}-01`;
}
