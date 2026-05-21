import { isOfflineError } from '../connectivity';

describe('isOfflineError', () => {
  it('recognizes common fetch / network failure messages', () => {
    expect(isOfflineError(new Error('Failed to fetch'))).toBe(true);
    expect(isOfflineError(new Error('Network request failed'))).toBe(true);
    expect(isOfflineError(new TypeError('NetworkError when attempting to fetch resource'))).toBe(
      true,
    );
    expect(isOfflineError(new Error('Load failed'))).toBe(true);
    expect(isOfflineError(new Error('request timeout'))).toBe(true);
  });

  it('does not flag real server-side errors as offline', () => {
    expect(isOfflineError(new Error('duplicate key value violates unique constraint'))).toBe(false);
    expect(isOfflineError(new Error('permission denied for table reviews'))).toBe(false);
    expect(isOfflineError(new Error('invalid input syntax'))).toBe(false);
  });

  it('handles non-Error values without throwing', () => {
    expect(isOfflineError('Failed to fetch')).toBe(true);
    expect(isOfflineError(null)).toBe(false);
    expect(isOfflineError(undefined)).toBe(false);
    expect(isOfflineError({ weird: true })).toBe(false);
  });
});
