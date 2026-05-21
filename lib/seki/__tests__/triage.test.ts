import {
  DEFAULT_TRIAGE_MODE,
  decideTriageStatus,
  effectiveDeck,
  isInActiveDeck,
  isPreKnown,
  occupiesDeckSlot,
  pickFirstUnknowns,
  sessionBatch,
} from '../triage';
import type { TriageStatus } from '../types';

describe('default mode', () => {
  it('defaults to bulk triage', () => {
    expect(DEFAULT_TRIAGE_MODE).toBe('bulk');
  });
});

describe('decideTriageStatus / isInActiveDeck / isPreKnown', () => {
  it('"unknown" stays in the active deck', () => {
    const s = decideTriageStatus('unknown');
    expect(s).toBe('unknown');
    expect(isInActiveDeck(s)).toBe(true);
    expect(isPreKnown(s)).toBe(false);
  });

  it('"known" is archived as pre-known, not in deck', () => {
    const s = decideTriageStatus('known');
    expect(s).toBe('known');
    expect(isInActiveDeck(s)).toBe(false);
    expect(isPreKnown(s)).toBe(true);
  });

  it('"known_fully" is archived as pre-known, not in deck', () => {
    const s = decideTriageStatus('known_fully');
    expect(s).toBe('known_fully');
    expect(isInActiveDeck(s)).toBe(false);
    expect(isPreKnown(s)).toBe(true);
  });

  it('a still-pending card is neither in the deck nor pre-known', () => {
    expect(isInActiveDeck('pending')).toBe(false);
    expect(isPreKnown('pending')).toBe(false);
  });
});

describe('pickFirstUnknowns (deck promotion when known words are skipped)', () => {
  const pool = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10'];

  it('picks the first N unknowns in pool order', () => {
    const known = new Set(['w2', 'w5']);
    const got = pickFirstUnknowns(pool, 5, (w) => !known.has(w));
    expect(got).toEqual(['w1', 'w3', 'w4', 'w6', 'w7']);
  });

  it('stops early if the pool runs out before target', () => {
    const known = new Set(['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9']);
    const got = pickFirstUnknowns(pool, 5, (w) => !known.has(w));
    expect(got).toEqual(['w10']);
  });

  it('returns empty when targetCount is 0', () => {
    expect(pickFirstUnknowns(pool, 0, () => true)).toEqual([]);
  });

  it('rejects negative or fractional targetCount', () => {
    expect(() => pickFirstUnknowns(pool, -1, () => true)).toThrow(RangeError);
    expect(() => pickFirstUnknowns(pool, 1.5, () => true)).toThrow(RangeError);
  });
});

describe('occupiesDeckSlot', () => {
  it('pending and unknown occupy a deck slot', () => {
    expect(occupiesDeckSlot('pending')).toBe(true);
    expect(occupiesDeckSlot('unknown')).toBe(true);
  });
  it('pre-known cards do not occupy a slot', () => {
    expect(occupiesDeckSlot('known')).toBe(false);
    expect(occupiesDeckSlot('known_fully')).toBe(false);
  });
});

describe('effectiveDeck', () => {
  function uc(position: number, triage_status: TriageStatus) {
    return { position, triage_status };
  }

  it('keeps only non-excluded cards, position-ordered, capped at W', () => {
    const cards = [
      uc(3, 'unknown'),
      uc(1, 'pending'),
      uc(2, 'known'), // excluded
      uc(5, 'unknown'),
      uc(4, 'known_fully'), // excluded
      uc(6, 'pending'),
    ];
    const eff = effectiveDeck(cards, 3);
    expect(eff.map((c) => c.position)).toEqual([1, 3, 5]);
  });

  it('returns fewer than W when the pool is small', () => {
    const cards = [uc(1, 'unknown'), uc(2, 'pending')];
    expect(effectiveDeck(cards, 10)).toHaveLength(2);
  });

  it('does not mutate the input array', () => {
    const cards = [uc(2, 'unknown'), uc(1, 'unknown')];
    effectiveDeck(cards, 10);
    expect(cards.map((c) => c.position)).toEqual([2, 1]);
  });
});

describe('sessionBatch (progressive-mode backfill)', () => {
  function uc(id: string, triage_status: TriageStatus) {
    return { id, triage_status };
  }

  it('returns the plain batch slice when nothing is pending (bulk / cycle 2+)', () => {
    const deck = [uc('a', 'unknown'), uc('b', 'unknown'), uc('c', 'unknown'), uc('d', 'unknown')];
    expect(sessionBatch(deck, 2, 3).map((c) => c.id)).toEqual(['b', 'c']);
  });

  it('prepends still-pending stragglers from earlier batches', () => {
    // Day 2 batch covers slots 3-4; slot 1 is already triaged but slot 2 is
    // still pending (a card shifted forward when a known word was excluded).
    const deck = [uc('a', 'unknown'), uc('b', 'pending'), uc('c', 'pending'), uc('d', 'pending')];
    expect(sessionBatch(deck, 3, 4).map((c) => c.id)).toEqual(['b', 'c', 'd']);
  });

  it('has no stragglers for the very first batch', () => {
    const deck = [uc('a', 'pending'), uc('b', 'pending'), uc('c', 'pending')];
    expect(sessionBatch(deck, 1, 2).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('clamps a batch range that runs past the deck end', () => {
    const deck = [uc('a', 'unknown'), uc('b', 'unknown')];
    expect(sessionBatch(deck, 1, 10).map((c) => c.id)).toEqual(['a', 'b']);
  });
});
