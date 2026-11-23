import { describe, expect, it } from 'vitest';
import { findRepeatedOpenings, findRepeatedPhrases, type RepeatGroup } from './repetition';

const slices = (text: string, g: RepeatGroup) => g.ranges.map((r) => text.slice(r.start, r.end));

describe('findRepeatedPhrases', () => {
  it('reports the maximal phrase repeated 3 times', () => {
    const text = 'Cô nhìn ra cửa sổ. Cô nhìn ra cửa sổ. Rồi cô nhìn ra cửa sổ.';
    const groups = findRepeatedPhrases(text, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('phrase');
    expect(groups[0].label).toBe('Cô nhìn ra cửa sổ');
    expect(slices(text, groups[0])).toEqual(['Cô nhìn ra cửa sổ', 'Cô nhìn ra cửa sổ', 'cô nhìn ra cửa sổ']);
  });

  it('ignores a 3-word phrase repeated 3 times', () => {
    expect(findRepeatedPhrases('Anh cầm tập hồ sơ. Em đọc tập hồ sơ. Rồi tập hồ sơ rơi.', [])).toEqual([]);
  });

  it('ignores a phrase repeated only twice', () => {
    expect(findRepeatedPhrases('Cô nhìn ra cửa sổ. Cô nhìn ra cửa sổ.', [])).toEqual([]);
  });

  it('does not count a phrase split by a sentence end', () => {
    const text = 'nhìn ra. cửa sổ. nhìn ra. cửa sổ. nhìn ra. cửa sổ.';
    expect(findRepeatedPhrases(text, [])).toEqual([]);
  });

  it('skips stop-word-only phrases', () => {
    expect(findRepeatedPhrases('và là của. và là của. và là của.', [])).toEqual([]);
  });

  it('honours the ignore list, also for repeats that contain the phrase', () => {
    const text = 'Khun Emi nói với em. Khun Emi nói với em. Khun Emi nói với em.';
    expect(findRepeatedPhrases(text, ['Khun Emi'])).toEqual([]);
    expect(findRepeatedPhrases(text, [])).toHaveLength(1);
  });

  it('maps ranges back through NFD text and CRLF', () => {
    const sentence = 'Cô nhìn ra cửa sổ'.normalize('NFD');
    const text = [sentence + '.', sentence + '.', sentence + '.'].join('\r\n');
    const groups = findRepeatedPhrases(text, []);
    expect(groups).toHaveLength(1);
    expect(slices(text, groups[0])).toEqual([sentence, sentence, sentence]);
  });

  it('skips image lines', () => {
    expect(findRepeatedPhrases('[[image:3]]\n[[image:3]]\n[[image:3]]', [])).toEqual([]);
  });
});

describe('findRepeatedOpenings', () => {
  it('finds 3 sentences in a row with the same first two words, across paragraphs', () => {
    const text = 'Em đã đi. Em đã khóc.\n\nEm đã ngủ.';
    const groups = findRepeatedOpenings(text);
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe('opening');
    expect(groups[0].label).toBe('Em đã');
    expect(slices(text, groups[0])).toEqual(['Em đã', 'Em đã', 'Em đã']);
  });

  it('does not report a run of two', () => {
    expect(findRepeatedOpenings('Em đã đi. Em đã khóc.')).toEqual([]);
  });

  it('a run of four is one group', () => {
    const groups = findRepeatedOpenings('Em đã đi. Em đã khóc. Em đã ngủ. Em đã dậy.');
    expect(groups).toHaveLength(1);
    expect(groups[0].ranges).toHaveLength(4);
  });

  it('a different sentence breaks the run', () => {
    expect(findRepeatedOpenings('Em đã đi. Em đã khóc. Anh ở lại. Em đã ngủ.')).toEqual([]);
  });
});
