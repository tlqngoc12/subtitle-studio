import { describe, expect, it } from 'vitest';
import { alignParagraph, countText, findMatches, imageMarkerId, paragraphIndexAt, paragraphs } from './chapterText';

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

describe('imageMarkerId', () => {
  it('reads a paragraph that is only a marker', () => {
    expect(imageMarkerId('[[image:42]]')).toBe(42);
    expect(imageMarkerId('  [[image:7]]  ')).toBe(7);
  });

  it('is null for text that merely holds a marker', () => {
    expect(imageMarkerId('see [[image:42]]')).toBeNull();
    expect(imageMarkerId('[[image:x]]')).toBeNull();
    expect(imageMarkerId('plain')).toBeNull();
  });
});

describe('alignParagraph', () => {
  it('is the identity for a chapter without images', () => {
    const source = ['A', 'B', 'C'];
    expect(alignParagraph(source, ['a', 'b', 'c'], 0)).toBe(0);
    expect(alignParagraph(source, ['a', 'b', 'c'], 2)).toBe(2);
    expect(alignParagraph(source, ['a', 'b', 'c', 'd'], 3)).toBe(3);
  });

  it('sends the text of an image to the marker and the text after it to the original paragraph', () => {
    const source = ['A', '[[image:1]]', 'B'];
    const translated = ['a', '[[image:1]]', 'x', 'y', 'b'];

    expect(translated.map((_, i) => alignParagraph(source, translated, i))).toEqual([0, 1, 1, 1, 2]);
  });

  it('follows a marker that the translator moved', () => {
    const source = ['A', '[[image:1]]', 'B', '[[image:2]]', 'C'];
    const translated = ['a', '[[image:2]]', 'c', '[[image:1]]', 'text of image one', 'b'];

    expect(translated.map((_, i) => alignParagraph(source, translated, i))).toEqual([0, 3, 4, 1, 1, 2]);
  });

  it('maps a chapter of images only to the markers', () => {
    const source = ['[[image:1]]', '[[image:2]]', '[[image:3]]'];
    const translated = ['[[image:1]]', '[[image:2]]', 'Card two', 'Card two, more', '[[image:3]]', 'Card three'];

    expect(translated.map((_, i) => alignParagraph(source, translated, i))).toEqual([0, 1, 1, 1, 2, 2]);
  });

  it('keeps a paragraph before the first marker inside its own segment', () => {
    const source = ['A1', 'A2', '[[image:1]]', 'B'];
    const translated = ['a1', 'a2', 'a3', '[[image:1]]', 'b'];

    expect(translated.map((_, i) => alignParagraph(source, translated, i))).toEqual([0, 1, 1, 2, 3]);
  });

  it('stays inside the original when the translation has more paragraphs', () => {
    const source = ['A', '[[image:1]]'];
    const translated = ['a', 'a2', 'a3', '[[image:1]]', 't1', 't2'];

    expect(translated.map((_, i) => alignParagraph(source, translated, i))).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it('stays inside the original when the caret is past the last translated paragraph', () => {
    expect(alignParagraph(['A', '[[image:1]]'], ['a'], 5)).toBe(1);
  });

  it('falls back to the position when the translation names a marker the original lacks', () => {
    expect(alignParagraph(['A', '[[image:1]]', 'B'], ['a', '[[image:9]]', 'b'], 1)).toBe(1);
  });
});
