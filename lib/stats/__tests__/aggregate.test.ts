import {
  aggregateByArticle,
  aggregateByCycle,
  aggregateByMonth,
  aggregateByMonthsBucket,
  aggregateByPos,
  aggregateByWeek,
  aggregateLevelProgress,
  aggregateMasteredOverTime,
} from '../aggregate';
import type { CardRow, ReviewRow, UserCardRow } from '../../db/types';
import type { CefrLevel, Rating, TriageStatus } from '../../seki/types';

function review(cycle: number, rating: Rating, reviewedAt: string, userCardId = 'uc1'): ReviewRow {
  return {
    id: `r-${Math.random()}`,
    user_card_id: userCardId,
    user_id: 'u1',
    cycle,
    batch: 1,
    day: 1,
    rating,
    reviewed_at: reviewedAt,
  };
}

describe('aggregateByCycle', () => {
  it('produces 7 empty buckets when there are no reviews', () => {
    const result = aggregateByCycle([]);
    expect(result).toHaveLength(7);
    expect(result.every((b) => b.total === 0)).toBe(true);
    expect(result.map((b) => b.cycle)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('counts YES/HALF/NO per cycle correctly', () => {
    const reviews = [
      review(1, 'YES', '2026-01-01T00:00:00Z'),
      review(1, 'HALF', '2026-01-01T00:00:00Z'),
      review(1, 'NO', '2026-01-01T00:00:00Z'),
      review(2, 'YES', '2026-01-08T00:00:00Z'),
      review(2, 'YES', '2026-01-08T00:00:00Z'),
      review(7, 'NO', '2026-03-01T00:00:00Z'),
    ];
    const result = aggregateByCycle(reviews);
    expect(result[0]).toEqual({ cycle: 1, yes: 1, half: 1, no: 1, total: 3 });
    expect(result[1]).toEqual({ cycle: 2, yes: 2, half: 0, no: 0, total: 2 });
    expect(result[6]).toEqual({ cycle: 7, yes: 0, half: 0, no: 1, total: 1 });
  });

  it('skips invalid cycle indices', () => {
    const reviews = [
      { ...review(1, 'YES', '2026-01-01T00:00:00Z'), cycle: 0 },
      { ...review(1, 'YES', '2026-01-01T00:00:00Z'), cycle: 8 },
    ];
    const result = aggregateByCycle(reviews);
    expect(result.every((b) => b.total === 0)).toBe(true);
  });
});

describe('aggregateMasteredOverTime', () => {
  function uc(id: string, isMastered: boolean, createdAt: string): UserCardRow {
    return {
      id,
      user_id: 'u1',
      deck_id: 'd1',
      card_id: 'c1',
      position: 1,
      triage_status: 'unknown',
      is_mastered: isMastered,
      is_weak: false,
      no_count: 0,
      tags: [],
      created_at: createdAt,
    };
  }

  it('returns empty when nothing is mastered', () => {
    expect(aggregateMasteredOverTime([uc('1', false, '2026-01-01T00:00:00Z')])).toEqual([]);
  });

  it('accumulates over distinct dates in ascending order', () => {
    const result = aggregateMasteredOverTime([
      uc('1', true, '2026-01-03T00:00:00Z'),
      uc('2', true, '2026-01-01T00:00:00Z'),
      uc('3', true, '2026-01-01T00:00:00Z'),
      uc('4', true, '2026-01-05T00:00:00Z'),
    ]);
    expect(result).toEqual([
      { date: '2026-01-01', cumulative: 2 },
      { date: '2026-01-03', cumulative: 3 },
      { date: '2026-01-05', cumulative: 4 },
    ]);
  });
});

describe('aggregateByPos / aggregateByArticle', () => {
  const cards: CardRow[] = [
    {
      id: 'c-noun-der',
      canonical_key: 'tisch',
      term_de: 'der Tisch',
      article: 'der',
      pos: 'noun',
      translations_ja: [],
      translations_en: [],
      examples: [],
      prateritum: null,
      partizip_ii: null,
      plural: null,
      notes: [],
      levels: ['B1'],
      sources: [],
      categories: [],
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'c-verb',
      canonical_key: 'gehen',
      term_de: 'gehen',
      article: null,
      pos: 'verb',
      translations_ja: [],
      translations_en: [],
      examples: [],
      prateritum: null,
      partizip_ii: null,
      plural: null,
      notes: [],
      levels: ['A2'],
      sources: [],
      categories: [],
      created_at: '2026-01-01T00:00:00Z',
    },
  ];

  const userCards: UserCardRow[] = [
    {
      id: 'uc-noun',
      user_id: 'u1',
      deck_id: 'd1',
      card_id: 'c-noun-der',
      position: 1,
      triage_status: 'unknown',
      is_mastered: false,
      is_weak: false,
      no_count: 0,
      tags: [],
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'uc-verb',
      user_id: 'u1',
      deck_id: 'd1',
      card_id: 'c-verb',
      position: 2,
      triage_status: 'unknown',
      is_mastered: false,
      is_weak: false,
      no_count: 0,
      tags: [],
      created_at: '2026-01-01T00:00:00Z',
    },
  ];

  it('computes YES rate per POS', () => {
    const reviews: ReviewRow[] = [
      review(1, 'YES', '2026-01-01T00:00:00Z', 'uc-noun'),
      review(2, 'NO', '2026-01-08T00:00:00Z', 'uc-noun'),
      review(1, 'YES', '2026-01-01T00:00:00Z', 'uc-verb'),
      review(2, 'YES', '2026-01-08T00:00:00Z', 'uc-verb'),
    ];
    const result = aggregateByPos(reviews, userCards, cards);
    const noun = result.find((r) => r.category === 'noun');
    const verb = result.find((r) => r.category === 'verb');
    expect(noun).toEqual({ category: 'noun', yesRate: 0.5, total: 2 });
    expect(verb).toEqual({ category: 'verb', yesRate: 1, total: 2 });
  });

  it('only includes articles with at least one review', () => {
    const reviews = [review(1, 'YES', '2026-01-01T00:00:00Z', 'uc-noun')];
    const result = aggregateByArticle(reviews, userCards, cards);
    expect(result).toEqual([{ category: 'der', yesRate: 1, total: 1 }]);
  });
});

describe('aggregateByWeek / aggregateByMonth', () => {
  it('groups by ISO week (Monday start)', () => {
    const reviews = [
      // Mon 2026-01-05 (week of 2026-01-05)
      review(1, 'YES', '2026-01-05T10:00:00Z'),
      // Wed 2026-01-07 (same week)
      review(1, 'NO', '2026-01-07T10:00:00Z'),
      // Mon 2026-01-12 (next week)
      review(1, 'YES', '2026-01-12T10:00:00Z'),
    ];
    const result = aggregateByWeek(reviews);
    expect(result).toEqual([
      { periodStart: '2026-01-05', reviewCount: 2, yesRate: 0.5 },
      { periodStart: '2026-01-12', reviewCount: 1, yesRate: 1 },
    ]);
  });

  it('groups by calendar month', () => {
    const reviews = [
      review(1, 'YES', '2026-01-15T10:00:00Z'),
      review(1, 'YES', '2026-01-31T10:00:00Z'),
      review(1, 'NO', '2026-02-01T10:00:00Z'),
    ];
    const result = aggregateByMonth(reviews);
    expect(result).toEqual([
      { periodStart: '2026-01-01', reviewCount: 2, yesRate: 1 },
      { periodStart: '2026-02-01', reviewCount: 1, yesRate: 0 },
    ]);
  });

  it('groups by 3-month buckets aligned to calendar quarters', () => {
    const reviews = [
      review(1, 'YES', '2026-01-15T10:00:00Z'), // Q1
      review(1, 'NO', '2026-03-31T10:00:00Z'), // Q1
      review(1, 'YES', '2026-04-01T10:00:00Z'), // Q2
      review(1, 'YES', '2026-08-15T10:00:00Z'), // Q3
      review(1, 'NO', '2026-12-31T10:00:00Z'), // Q4
    ];
    const result = aggregateByMonthsBucket(reviews, 3);
    expect(result).toEqual([
      { periodStart: '2026-01-01', reviewCount: 2, yesRate: 0.5 },
      { periodStart: '2026-04-01', reviewCount: 1, yesRate: 1 },
      { periodStart: '2026-07-01', reviewCount: 1, yesRate: 1 },
      { periodStart: '2026-10-01', reviewCount: 1, yesRate: 0 },
    ]);
  });

  it('groups by 6-month buckets (H1 / H2)', () => {
    const reviews = [
      review(1, 'YES', '2026-02-01T10:00:00Z'), // H1
      review(1, 'NO', '2026-06-30T10:00:00Z'), // H1
      review(1, 'YES', '2026-07-01T10:00:00Z'), // H2
      review(1, 'YES', '2027-01-01T10:00:00Z'), // next year H1
    ];
    const result = aggregateByMonthsBucket(reviews, 6);
    expect(result).toEqual([
      { periodStart: '2026-01-01', reviewCount: 2, yesRate: 0.5 },
      { periodStart: '2026-07-01', reviewCount: 1, yesRate: 1 },
      { periodStart: '2027-01-01', reviewCount: 1, yesRate: 1 },
    ]);
  });

  it('groups by 12-month buckets (calendar years)', () => {
    const reviews = [
      review(1, 'YES', '2026-01-01T10:00:00Z'),
      review(1, 'YES', '2026-12-31T10:00:00Z'),
      review(1, 'NO', '2027-01-01T10:00:00Z'),
      review(1, 'YES', '2028-06-01T10:00:00Z'),
    ];
    const result = aggregateByMonthsBucket(reviews, 12);
    expect(result).toEqual([
      { periodStart: '2026-01-01', reviewCount: 2, yesRate: 1 },
      { periodStart: '2027-01-01', reviewCount: 1, yesRate: 0 },
      { periodStart: '2028-01-01', reviewCount: 1, yesRate: 1 },
    ]);
  });

  it('rejects invalid monthsPerBucket', () => {
    expect(() => aggregateByMonthsBucket([], 0)).toThrow(RangeError);
    expect(() => aggregateByMonthsBucket([], -1)).toThrow(RangeError);
    expect(() => aggregateByMonthsBucket([], 1.5)).toThrow(RangeError);
  });
});

describe('aggregateLevelProgress', () => {
  function uc(
    cardId: string,
    triage_status: TriageStatus,
    is_mastered: boolean,
  ): Pick<UserCardRow, 'card_id' | 'triage_status' | 'is_mastered'> {
    return { card_id: cardId, triage_status, is_mastered };
  }

  const levels = new Map<string, CefrLevel>([
    ['c1', 'A1'],
    ['c2', 'A1'],
    ['c3', 'A1'],
    ['c4', 'B1'],
  ]);
  const totals = { A1: 100, B1: 50 };

  it('counts mastered and pre-known as known, unknown as studying', () => {
    const result = aggregateLevelProgress(
      [
        uc('c1', 'unknown', true),
        uc('c2', 'known', false),
        uc('c3', 'unknown', false),
        uc('c4', 'unknown', false),
      ],
      levels,
      totals,
    );
    const a1 = result.find((r) => r.level === 'A1')!;
    expect(a1).toEqual({ level: 'A1', total: 100, known: 2, studying: 1 });
    const b1 = result.find((r) => r.level === 'B1')!;
    expect(b1).toEqual({ level: 'B1', total: 50, known: 0, studying: 1 });
  });

  it('de-duplicates a card across decks, known wins over studying', () => {
    const result = aggregateLevelProgress(
      [uc('c1', 'unknown', false), uc('c1', 'unknown', true)],
      levels,
      totals,
    );
    const a1 = result.find((r) => r.level === 'A1')!;
    expect(a1.known).toBe(1);
    expect(a1.studying).toBe(0);
  });

  it('ignores pending cards and unknown card ids', () => {
    const result = aggregateLevelProgress(
      [uc('c1', 'pending', false), uc('cX', 'unknown', false)],
      levels,
      totals,
    );
    expect(result.find((r) => r.level === 'A1')!).toEqual({
      level: 'A1',
      total: 100,
      known: 0,
      studying: 0,
    });
  });

  it('returns one row per level in levelTotals, sorted', () => {
    const result = aggregateLevelProgress([], levels, totals);
    expect(result.map((r) => r.level)).toEqual(['A1', 'B1']);
  });
});
