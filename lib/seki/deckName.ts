/**
 * Deck name validation, shared by deck creation and renaming.
 */

/** Longest deck name accepted. */
export const MAX_DECK_NAME_LENGTH = 60;

export type DeckNameResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'empty' | 'too_long' };

/** Trim the raw input and check it is non-empty and within the length limit. */
export function validateDeckName(raw: string): DeckNameResult {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, reason: 'empty' };
  if (name.length > MAX_DECK_NAME_LENGTH) return { ok: false, reason: 'too_long' };
  return { ok: true, name };
}
