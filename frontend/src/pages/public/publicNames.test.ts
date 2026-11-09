import { describe, expect, it } from 'vitest';
import { publicChapterLabel, publicChapterName } from './publicNames';

describe('publicNames', () => {
  it('names a chapter by its number or label', () => {
    expect(publicChapterName(5)).toBe('Chương 5');
    expect(publicChapterName(5, null)).toBe('Chương 5');
    expect(publicChapterName(5, '  ')).toBe('Chương 5');
    expect(publicChapterName(31, ' Ngoại truyện 1 ')).toBe('Ngoại truyện 1');
  });

  it('adds the title', () => {
    expect(publicChapterLabel(5, 'Mưa', null)).toBe('Chương 5: Mưa');
    expect(publicChapterLabel(5, null)).toBe('Chương 5');
    expect(publicChapterLabel(31, 'Ngày cưới', 'Ngoại truyện 1')).toBe('Ngoại truyện 1: Ngày cưới');
  });
});
