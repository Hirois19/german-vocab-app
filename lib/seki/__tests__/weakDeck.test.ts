import {
  DEFAULT_WEAK_THRESHOLD_N,
  countRating,
  defaultWeakDeckSettings,
  finalCycleRating,
  isWeakCard,
} from '../weakDeck';
import type { Rating, UserCardReviewSummary } from '../types';

function card(...ratings: (Rating | undefined)[]): UserCardReviewSummary {
  const ratingsByCycle: Partial<Record<number, Rating>> = {};
  ratings.forEach((r, i) => {
    if (r) ratingsByCycle[i + 1] = r;
  });
  return { ratingsByCycle };
}

describe('defaults', () => {
  it('defaultWeakDeckSettings uses N=5', () => {
    expect(defaultWeakDeckSettings()).toEqual({ weakThresholdN: DEFAULT_WEAK_THRESHOLD_N });
    expect(DEFAULT_WEAK_THRESHOLD_N).toBe(5);
  });
});

describe('countRating / finalCycleRating', () => {
  it('counts NO ratings across all cycles', () => {
    const c = card('YES', 'NO', 'HALF', 'NO', 'YES', 'NO', 'YES');
    expect(countRating(c, 'NO')).toBe(3);
    expect(countRating(c, 'YES')).toBe(3);
    expect(countRating(c, 'HALF')).toBe(1);
  });

  it('finalCycleRating returns the cycle-7 rating', () => {
    expect(finalCycleRating(card('YES', 'YES', 'YES', 'YES', 'YES', 'YES', 'NO'))).toBe('NO');
    expect(finalCycleRating(card('YES', 'YES', 'YES'))).toBeUndefined();
  });
});

describe('isWeakCard (combined judgment: N=5 NO OR final NO/HALF)', () => {
  const settings = defaultWeakDeckSettings();

  it('NO count exactly 5 (>= N) → weak', () => {
    const c = card('NO', 'NO', 'NO', 'NO', 'NO', 'YES', 'YES');
    expect(isWeakCard(c, settings)).toBe(true);
  });

  it('NO count 4 (< N) and final YES → not weak', () => {
    const c = card('NO', 'NO', 'NO', 'NO', 'YES', 'YES', 'YES');
    expect(isWeakCard(c, settings)).toBe(false);
  });

  it('NO count 0 but final cycle is NO → weak', () => {
    const c = card('YES', 'YES', 'YES', 'YES', 'YES', 'YES', 'NO');
    expect(isWeakCard(c, settings)).toBe(true);
  });

  it('NO count 0 but final cycle is HALF → weak', () => {
    const c = card('YES', 'YES', 'YES', 'YES', 'YES', 'YES', 'HALF');
    expect(isWeakCard(c, settings)).toBe(true);
  });

  it('all YES → not weak', () => {
    const c = card('YES', 'YES', 'YES', 'YES', 'YES', 'YES', 'YES');
    expect(isWeakCard(c, settings)).toBe(false);
  });

  it('all HALF → weak (final is HALF)', () => {
    const c = card('HALF', 'HALF', 'HALF', 'HALF', 'HALF', 'HALF', 'HALF');
    expect(isWeakCard(c, settings)).toBe(true);
  });

  it('custom threshold N=3 triggers earlier', () => {
    const c = card('NO', 'NO', 'NO', 'YES', 'YES', 'YES', 'YES');
    expect(isWeakCard(c, { weakThresholdN: 3 })).toBe(true);
    expect(isWeakCard(c, { weakThresholdN: 5 })).toBe(false);
  });

  it('rejects invalid threshold N', () => {
    const c = card('YES', 'YES', 'YES', 'YES', 'YES', 'YES', 'YES');
    expect(() => isWeakCard(c, { weakThresholdN: 0 })).toThrow(RangeError);
    expect(() => isWeakCard(c, { weakThresholdN: -1 })).toThrow(RangeError);
    expect(() => isWeakCard(c, { weakThresholdN: 1.5 })).toThrow(RangeError);
  });
});
