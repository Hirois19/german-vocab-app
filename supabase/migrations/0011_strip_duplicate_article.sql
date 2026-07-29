-- 0011_strip_duplicate_article.sql
-- Remove the article from `cards.term_de` where it duplicates `cards.article`.
--
-- Several source spreadsheets carried the article inside the term cell ("die
-- Badewanne") as well as in its own column, so the card rendered the gender
-- twice: "die" on the article line and "die Badewanne" on the term line. The
-- article column is the source of truth; the term keeps the bare noun.
--
-- Rows whose article column is empty are left untouched. That protects
-- phrases where the word is not an article at all ("das heißt") and entries
-- with a compound gender ("der/die Abgeordnete"), neither of which can be
-- split safely.
--
-- Idempotent: after the first run no row matches the predicate any more.

update public.cards
set term_de = regexp_replace(term_de, '^(der|die|das)\s+', '', 'i')
where article is not null
  and term_de ~* '^(der|die|das)\s';
