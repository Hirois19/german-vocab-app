import { MAX_DECK_NAME_LENGTH, validateDeckName } from '../deckName';

describe('validateDeckName', () => {
  it('trims surrounding whitespace', () => {
    expect(validateDeckName('  B1 #2  ')).toEqual({ ok: true, name: 'B1 #2' });
  });

  it('rejects empty and whitespace-only names', () => {
    expect(validateDeckName('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateDeckName('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('accepts a name of exactly the maximum length and rejects one more', () => {
    expect(validateDeckName('a'.repeat(MAX_DECK_NAME_LENGTH)).ok).toBe(true);
    expect(validateDeckName('a'.repeat(MAX_DECK_NAME_LENGTH + 1))).toEqual({
      ok: false,
      reason: 'too_long',
    });
  });

  it('measures the length after trimming', () => {
    expect(validateDeckName(` ${'a'.repeat(MAX_DECK_NAME_LENGTH)} `).ok).toBe(true);
  });
});
