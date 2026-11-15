import { describe, expect, it } from 'vitest';
import { countText, findMatches, paragraphIndexAt, paragraphs } from './chapterText';

describe('paragraphs', () => {
  it('splits on blank lines, trims and drops empty ones', () => {
    expect(paragraphs('  One\n\n\n\nTwo  \n \nThree\n\n')).toEqual(['One', 'Two', 'Three']);
  });

  it('copes with CRLF line endings', () => {
    expect(paragraphs('One\r\n\r\nTwo\r\n\r\n\r\nThree')).toEqual(['One', 'Two', 'Three']);
  });

  it('keeps a single line break inside a paragraph', () => {
    expect(paragraphs('a\nb\n\nc')).toEqual(['a\nb', 'c']);
  });

  it('gives nothing for blank text', () => {
    expect(paragraphs('')).toEqual([]);
    expect(paragraphs(' \n\n ')).toEqual([]);
  });
});

describe('countText', () => {
  it('counts words, characters and paragraphs', () => {
    expect(countText('Hello big world\n\nSecond one')).toEqual({ words: 5, characters: 27, paragraphs: 2 });
  });

  it('counts nothing for empty text', () => {
    expect(countText('')).toEqual({ words: 0, characters: 0, paragraphs: 0 });
  });
});

describe('paragraphIndexAt', () => {
  const text = 'One\n\nTwo\n\nThree';

  it('finds the paragraph around the caret', () => {
    expect(paragraphIndexAt(text, 0)).toBe(0);
    expect(paragraphIndexAt(text, 2)).toBe(0);
    expect(paragraphIndexAt(text, 6)).toBe(1);
    expect(paragraphIndexAt(text, 12)).toBe(2);
  });

  it('keeps the end of a paragraph in that paragraph and moves on after the blank line', () => {
    expect(paragraphIndexAt(text, 3)).toBe(0); // right after "One"
    expect(paragraphIndexAt(text, 4)).toBe(1); // inside the blank line
    expect(paragraphIndexAt(text, 5)).toBe(1); // start of "Two"
  });

  it('ignores leading blank lines and clamps past the end', () => {
    expect(paragraphIndexAt('\n\nOne\n\nTwo', 0)).toBe(0);
    expect(paragraphIndexAt('One\n\nTwo\n\n\n', 11)).toBe(1);
  });

  it('is 0 for empty text', () => {
    expect(paragraphIndexAt('', 0)).toBe(0);
  });
});

describe('findMatches', () => {
  it('finds literal, non-overlapping matches', () => {
    expect(findMatches('aaaa', 'aa', true)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it('ignores case unless asked', () => {
    expect(findMatches('Mai mai MAI', 'mai', false)).toHaveLength(3);
    expect(findMatches('Mai mai MAI', 'mai', true)).toEqual([{ start: 4, end: 7 }]);
  });

  it('treats the query literally, not as a regex', () => {
    expect(findMatches('a.b a*b', '.', true)).toEqual([{ start: 1, end: 2 }]);
    expect(findMatches('a.b a*b', 'a*b', true)).toEqual([{ start: 4, end: 7 }]);
  });

  it('gives nothing for an empty query or no match', () => {
    expect(findMatches('abc', '', false)).toEqual([]);
    expect(findMatches('abc', 'z', false)).toEqual([]);
  });
});
