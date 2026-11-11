import { inferCoveredLevels, nextLevelCandidates, pickNextLevel, sortLevels } from '../levels';

const many = (levels: string[], n: number) => Array.from({ length: n }, () => levels);

describe('sortLevels', () => {
  it('orders pedagogically and drops duplicates', () => {
    expect(sortLevels(['B2', 'A1', 'B2', 'A2'])).toEqual(['A1', 'A2', 'B2']);
  });
});

describe('inferCoveredLevels', () => {
  it('infers A1+A2 from a deck of A1 and A2 cards', () => {
    expect(inferCoveredLevels([...many(['A1'], 300), ...many(['A2'], 400)])).toEqual(['A1', 'A2']);
  });

  it('does not mark B1 covered by a single multi-level card in an A1+A2 deck', () => {
    const arm = ['B1', 'A1'];
    expect(inferCoveredLevels([...many(['A1'], 300), ...many(['A2'], 400), arm])).toEqual([
      'A1',
      'A2',
    ]);
  });

  it('does not mark A1 covered by a few homonyms in a B1 deck', () => {
    const cards = [...many(['B1'], 700), ['B1', 'A1'], ['B1', 'A1'], ['A2', 'B1']];
    expect(inferCoveredLevels(cards)).toEqual(['B1']);
  });

  it('counts each card once per level and honours a custom threshold', () => {
    expect(inferCoveredLevels([['A1', 'A1'], ['A1']], 3)).toEqual([]);
    expect(inferCoveredLevels([['A1'], ['A1']], 2)).toEqual(['A1']);
  });

  it('returns an empty list for an empty deck', () => {
    expect(inferCoveredLevels([])).toEqual([]);
  });
});

describe('nextLevelCandidates', () => {
  it('goes above the highest covered level first, then fills lower gaps', () => {
    expect(nextLevelCandidates(['A1', 'A2'])).toEqual(['B1', 'B2', 'C1', 'C2']);
    expect(nextLevelCandidates(['B1', 'B2'])).toEqual(['C1', 'C2', 'A1', 'A2']);
    expect(nextLevelCandidates([])).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  });

  it('is empty when every level is covered', () => {
    expect(nextLevelCandidates(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])).toEqual([]);
  });
});

describe('pickNextLevel', () => {
  const all = { A1: 10, A2: 10, B1: 10, B2: 10, C1: 10, C2: 10 };

  it('picks B1 after A1+A2', () => {
    expect(pickNextLevel(['A1', 'A2'], all)).toBe('B1');
  });

  it('picks B2 after B1 only', () => {
    expect(pickNextLevel(['B1'], all)).toBe('B2');
  });

  it('skips levels without remaining cards', () => {
    expect(pickNextLevel(['A1', 'A2'], { B1: 0, B2: 0, C1: 4 })).toBe('C1');
  });

  it('falls back to lower levels when nothing is left above', () => {
    expect(pickNextLevel(['C1'], { C2: 0, A1: 20, B1: 5 })).toBe('A1');
    expect(pickNextLevel(['B1'], { B2: 0, C1: 0, C2: 0, A2: 3 })).toBe('A2');
  });

  it('returns null when nothing is left at all', () => {
    expect(pickNextLevel(['A1', 'A2'], {})).toBeNull();
    expect(pickNextLevel(['C1'], { C1: 9 })).toBeNull();
  });
});
