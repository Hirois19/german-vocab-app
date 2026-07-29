/**
 * What the speech engine should say for a card.
 *
 * `cards.term_de` holds the bare noun ("Arzt") and `cards.article` the gender
 * ("der"), so the two are rendered as separate lines on the card. Speaking the
 * bare noun would drop the gender, which is the part worth memorising, so the
 * spoken form joins them back together.
 *
 * Rows that still carry the article inline (older data, or entries like
 * "der/die Abgeordnete" where the article column is empty) are spoken as-is
 * rather than doubled up.
 */

export interface SpeakableCard {
  term_de: string;
  article: string | null;
}

export function spokenForm(card: SpeakableCard): string {
  const term = card.term_de.trim();
  const article = card.article?.trim();
  if (!article) return term;
  if (term.toLowerCase().startsWith(`${article.toLowerCase()} `)) return term;
  return `${article} ${term}`;
}
