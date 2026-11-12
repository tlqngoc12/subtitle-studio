import { describe, expect, it } from 'vitest';
import { isFilm, peopleHeading, roleSuggestions, subcategorySuggestions } from './categories';

describe('categories', () => {
  it('a work is a film when Film & TV is among the categories', () => {
    expect(isFilm(['MUSIC', 'FILM_TV'])).toBe(true);
    expect(isFilm(['MUSIC'])).toBe(false);
  });

  it('the people heading is Cast for a film, Artists for music alone, People otherwise', () => {
    expect(peopleHeading(['FILM_TV'])).toBe('Cast');
    expect(peopleHeading(['MUSIC', 'FILM_TV'])).toBe('Cast');
    expect(peopleHeading(['MUSIC'])).toBe('Artists');
    expect(peopleHeading(['MUSIC', 'VARIETY'])).toBe('People');
    expect(peopleHeading(['FASHION'])).toBe('People');
  });

  it('merges the role suggestions of every chosen category without repeats', () => {
    expect(roleSuggestions(['FILM_TV', 'MUSIC'])).toEqual(['Lead', 'Supporting', 'Guest', 'Cameo', 'Singer', 'Featuring', 'Vocal', 'MV cast']);
    expect(roleSuggestions(['FASHION'])).toEqual([]);
  });

  it('lists the fixed subcategories of every chosen category in category order', () => {
    expect(subcategorySuggestions(['MUSIC', 'FILM_TV'], [])).toEqual([
      'Series', 'Movie', 'Short film', 'Special', 'Single', 'OST', 'Album', 'Cover', 'Live',
    ]);
    expect(subcategorySuggestions(['CEREMONY'], [])).toEqual(['Awards', 'Red carpet']);
  });

  it('adds the subcategories already in use after the fixed ones, without case-insensitive repeats', () => {
    expect(subcategorySuggestions(['MUSIC'], ['single', 'Drama', 'drama', ' ', 'Remix'])).toEqual([
      'Single', 'OST', 'Album', 'Cover', 'Live', 'Drama', 'Remix',
    ]);
  });
});
