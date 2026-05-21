import {
  BATCHES_PER_CYCLE,
  TOTAL_DAYS,
  advanceDay,
  batchAssignmentForDay,
  batchForDay,
  cycleForDay,
  getBatchSize,
  isDeckComplete,
  wordRangeForBatch,
} from '../scheduler';

describe('getBatchSize', () => {
  it.each([
    [700, 100],
    [350, 50],
    [70, 10],
    [7, 1],
    [703, 101], // not divisible by 7 → ceil
    [1, 1],
  ])('W=%i → B=%i', (W, expected) => {
    expect(getBatchSize(W)).toBe(expected);
  });

  it.each([0, -1, 0.5, 3.14])('rejects invalid W=%s', (W) => {
    expect(() => getBatchSize(W as number)).toThrow(RangeError);
  });
});

describe('cycleForDay / batchForDay', () => {
  it.each([
    [1, 1, 1],
    [2, 1, 2],
    [7, 1, 7],
    [8, 2, 1],
    [14, 2, 7],
    [15, 3, 1],
    [42, 6, 7],
    [43, 7, 1],
    [49, 7, 7],
  ])('day=%i → cycle=%i, batch=%i', (day, cycle, batch) => {
    expect(cycleForDay(day)).toBe(cycle);
    expect(batchForDay(day)).toBe(batch);
  });

  it.each([0, -1, 50, 100])('rejects invalid day=%i', (day) => {
    expect(() => cycleForDay(day)).toThrow(RangeError);
    expect(() => batchForDay(day)).toThrow(RangeError);
  });
});

describe('wordRangeForBatch', () => {
  it('W=700, B=100 → batch 1 covers words 1..100', () => {
    expect(wordRangeForBatch(1, 100, 700)).toEqual({ wordStart: 1, wordEnd: 100 });
  });
  it('W=700, B=100 → batch 7 covers words 601..700', () => {
    expect(wordRangeForBatch(7, 100, 700)).toEqual({ wordStart: 601, wordEnd: 700 });
  });
  it('W=703, B=101 → batch 7 is truncated to 703', () => {
    expect(wordRangeForBatch(7, 101, 703)).toEqual({ wordStart: 607, wordEnd: 703 });
  });
  it('W=70, B=10 → batch 4 covers 31..40', () => {
    expect(wordRangeForBatch(4, 10, 70)).toEqual({ wordStart: 31, wordEnd: 40 });
  });
  it.each([0, -1, 8, 14])('rejects invalid batch=%i', (b) => {
    expect(() => wordRangeForBatch(b, 100, 700)).toThrow(RangeError);
  });
});

describe('batchAssignmentForDay (end-to-end)', () => {
  it('W=700, day 1 → cycle 1, batch 1, words 1..100', () => {
    expect(batchAssignmentForDay(1, 700, 700)).toEqual({
      day: 1,
      cycle: 1,
      batch: 1,
      wordStart: 1,
      wordEnd: 100,
    });
  });

  it('W=700, day 49 → cycle 7, batch 7, words 601..700', () => {
    expect(batchAssignmentForDay(49, 700, 700)).toEqual({
      day: 49,
      cycle: 7,
      batch: 7,
      wordStart: 601,
      wordEnd: 700,
    });
  });

  it('W=350, day 8 → cycle 2, batch 1, words 1..50', () => {
    expect(batchAssignmentForDay(8, 350, 350)).toEqual({
      day: 8,
      cycle: 2,
      batch: 1,
      wordStart: 1,
      wordEnd: 50,
    });
  });

  it('every word appears in exactly 7 batch assignments across 49 days', () => {
    const W = 700;
    const totalWords = 700;
    const seenCount = new Map<number, number>();
    for (let day = 1; day <= TOTAL_DAYS; day += 1) {
      const a = batchAssignmentForDay(day, W, totalWords);
      for (let w = a.wordStart; w <= a.wordEnd; w += 1) {
        seenCount.set(w, (seenCount.get(w) ?? 0) + 1);
      }
    }
    for (let w = 1; w <= totalWords; w += 1) {
      expect(seenCount.get(w)).toBe(7);
    }
  });

  it('correctly handles non-divisible W (W=703): last batch is short', () => {
    const W = 703;
    const totalWords = 703;
    const a7 = batchAssignmentForDay(7, W, totalWords); // cycle 1 batch 7
    expect(a7.wordEnd).toBe(703);
    expect(a7.wordEnd - a7.wordStart + 1).toBeLessThan(getBatchSize(W));
  });

  it('totalWords smaller than W does not push wordEnd past totalWords', () => {
    // Pool fell short during triage: e.g. W=700 but only 650 unknowns gathered.
    const a = batchAssignmentForDay(7, 700, 650);
    expect(a.wordEnd).toBe(650);
  });
});

describe('advanceDay / isDeckComplete', () => {
  it('day 1 advances to 2', () => {
    expect(advanceDay(1)).toBe(2);
  });
  it('day 48 advances to 49', () => {
    expect(advanceDay(48)).toBe(49);
  });
  it('day 49 advances to null (deck complete)', () => {
    expect(advanceDay(49)).toBeNull();
  });
  it('isDeckComplete(49) is false (49 is still active)', () => {
    expect(isDeckComplete(49)).toBe(false);
  });
  it('isDeckComplete(50) is true', () => {
    expect(isDeckComplete(50)).toBe(true);
  });
});

describe('constants', () => {
  it('TOTAL_DAYS = BATCHES_PER_CYCLE^2', () => {
    expect(TOTAL_DAYS).toBe(BATCHES_PER_CYCLE * BATCHES_PER_CYCLE);
  });
});

describe('session-based progression (missed days do not advance Day)', () => {
  // Simulate: user completes 3 sessions, then skips 5 days, then completes another.
  // Day counter is NOT calendar-driven; advanceDay is only called on session completion.
  it('three completions and a gap result in day=4 at next session start', () => {
    let day: number | null = 1;
    day = advanceDay(day); // session 1 done → day 2
    day = advanceDay(day!); // session 2 done → day 3
    day = advanceDay(day!); // session 3 done → day 4
    // user skips Mon/Tue/Wed/Thu/Fri — no advanceDay calls happen
    expect(day).toBe(4);
  });
});
