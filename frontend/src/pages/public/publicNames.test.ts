import { describe, expect, it } from 'vitest';
import { bannerNovels, publicChapterLabel, publicChapterName, relativeTime } from './publicNames';
import { formatInstant } from '../../lib/dates';

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

  it('formats relative time', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
    expect(relativeTime(ago(30e3), now)).toBe('vừa xong');
    expect(relativeTime(ago(5 * 60e3), now)).toBe('5 phút trước');
    expect(relativeTime(ago(3 * 3600e3), now)).toBe('3 giờ trước');
    expect(relativeTime(ago(2 * 86400e3), now)).toBe('2 ngày trước');
    expect(relativeTime(ago(40 * 86400e3), now)).toBe(formatInstant(ago(40 * 86400e3)));
  });
});

describe('bannerNovels', () => {
  const n = (slug: string, day: string, featured?: boolean) => ({
    slug,
    featured,
    updatedAt: `2026-10-${day}T00:00:00Z`,
  });

  it('shows only the picked novels, newest first', () => {
    const list = [n('a', '01', true), n('b', '09'), n('c', '05', true), n('d', '08')];
    expect(bannerNovels(list).map((x) => x.slug)).toEqual(['c', 'a']);
  });

  it('keeps at most five picked novels', () => {
    const list = ['1', '2', '3', '4', '5', '6', '7'].map((d) => n(`p${d}`, `0${d}`, true));
    expect(bannerNovels(list).map((x) => x.slug)).toEqual(['p7', 'p6', 'p5', 'p4', 'p3']);
  });

  it('falls back to the five latest when none is picked or the flag is missing', () => {
    const list = ['1', '2', '3', '4', '5', '6'].map((d) => n(`x${d}`, `0${d}`));
    expect(bannerNovels(list).map((x) => x.slug)).toEqual(['x6', 'x5', 'x4', 'x3', 'x2']);
    expect(bannerNovels(list.map((x) => ({ ...x, featured: false }))).map((x) => x.slug)).toEqual(['x6', 'x5', 'x4', 'x3', 'x2']);
  });
});
