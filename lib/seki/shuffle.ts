/**
 * Deterministic seeded shuffle for the daily session.
 *
 * Why deterministic: the cards a user sees on day N must always be the same
 * SET (the SEKI batch boundaries are fixed by position), but within that day
 * the user wants the *order* randomized. A deterministic seed keyed on
 * (deckId, day) gives a stable random-looking order — reloads mid-session do
 * not reshuffle, and day N+1 gets a different order than day N.
 *
 * Implementation: a 32-bit string hash for the seed, then mulberry32 to draw
 * uniform doubles, then Fisher-Yates. All pure functions, easy to test.
 */

/** djb2-ish 32-bit string hash. Returns a non-negative integer. */
export function hash32(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (Math.imul(h, 31) + input.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

/** Mulberry32 PRNG. Given a 32-bit seed, returns a function that yields uniform [0,1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Return a new array with the input shuffled by Fisher-Yates using the given seed. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/**
 * Convenience: build the per-day shuffle seed from a deckId and day.
 * The same deck on the same day always shuffles to the same order, so
 * a refresh mid-session preserves the card order the user is working through.
 */
export function dailyShuffleSeed(deckId: string, day: number): number {
  return hash32(`${deckId}:day:${day}`);
}
