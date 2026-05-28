import { dailyShuffleSeed, hash32, mulberry32, seededShuffle } from '../shuffle';

describe('hash32', () => {
  it('is deterministic for the same input', () => {
    expect(hash32('hello')).toBe(hash32('hello'));
  });

  it('differs for different inputs', () => {
    expect(hash32('foo')).not.toBe(hash32('bar'));
  });

  it('returns a non-negative 32-bit integer', () => {
    const h = hash32('something');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
    expect(Number.isInteger(h)).toBe(true);
  });
});

describe('mulberry32', () => {
  it('produces a reproducible stream for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i += 1) expect(a()).toBe(b());
  });

  it('produces different streams for different seeds', () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });

  it('stays in the [0,1) interval', () => {
    const r = mulberry32(123);
    for (let i = 0; i < 1000; i += 1) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('seededShuffle', () => {
  it('preserves the set of items', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = seededShuffle(input, 12345);
    expect(out.slice().sort((a, b) => a - b)).toEqual(input);
  });

  it('does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5];
    const before = input.slice();
    seededShuffle(input, 1);
    expect(input).toEqual(before);
  });

  it('is deterministic for the same seed', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(seededShuffle(input, 7)).toEqual(seededShuffle(input, 7));
  });

  it('produces different orderings for different seeds', () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    const a = seededShuffle(input, 1);
    const b = seededShuffle(input, 999);
    expect(a).not.toEqual(b);
  });

  it('handles empty and singleton arrays', () => {
    expect(seededShuffle([], 1)).toEqual([]);
    expect(seededShuffle(['x'], 1)).toEqual(['x']);
  });
});

describe('dailyShuffleSeed', () => {
  it('is stable for the same deck and day', () => {
    const a = dailyShuffleSeed('deck-abc', 5);
    const b = dailyShuffleSeed('deck-abc', 5);
    expect(a).toBe(b);
  });

  it('differs across days for the same deck', () => {
    const a = dailyShuffleSeed('deck-abc', 1);
    const b = dailyShuffleSeed('deck-abc', 2);
    expect(a).not.toBe(b);
  });

  it('differs across decks for the same day', () => {
    const a = dailyShuffleSeed('deck-abc', 3);
    const b = dailyShuffleSeed('deck-xyz', 3);
    expect(a).not.toBe(b);
  });
});
