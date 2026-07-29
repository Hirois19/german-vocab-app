import { spokenForm } from '../spokenForm';

describe('spokenForm', () => {
  it('joins the article and the bare noun', () => {
    expect(spokenForm({ term_de: 'Arzt', article: 'der' })).toBe('der Arzt');
  });

  it('speaks the term alone when there is no article', () => {
    expect(spokenForm({ term_de: 'gehen', article: null })).toBe('gehen');
  });

  it('does not double an article that is already part of the term', () => {
    expect(spokenForm({ term_de: 'der Arzt', article: 'der' })).toBe('der Arzt');
  });

  it('matches the inline article case-insensitively', () => {
    expect(spokenForm({ term_de: 'Die Möbel', article: 'die' })).toBe('Die Möbel');
  });

  it('leaves compound articles alone when the column is empty', () => {
    expect(spokenForm({ term_de: 'der/die Abgeordnete', article: null })).toBe(
      'der/die Abgeordnete',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(spokenForm({ term_de: '  Angst ', article: ' die ' })).toBe('die Angst');
  });
});
