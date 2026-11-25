import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  SITE_NAME,
  bannerNovels,
  publicChapterTitle,
  relativeTime,
  useDocumentTitle,
} from './publicNames';
import { formatInstant } from '../../lib/dates';

describe('publicNames', () => {
  it('names a chapter by its title', () => {
    expect(publicChapterTitle({ chapterNo: 5, title: 'Chương 7: A' })).toBe('Chương 7: A');
    expect(publicChapterTitle({ chapterNo: 31, title: ' Ngoại truyện I ' })).toBe('Ngoại truyện I');
  });

  it('falls back for files published before the label was merged into the title', () => {
    expect(publicChapterTitle({ chapterNo: 5, label: 'Chương 4', title: null })).toBe('Chương 4');
    expect(publicChapterTitle({ chapterNo: 5, title: '  ', label: 'Chương 4' })).toBe('Chương 4');
    expect(publicChapterTitle({ chapterNo: 5 })).toBe('Chương 5');
    expect(publicChapterTitle({ chapterNo: 5, title: null, label: null })).toBe('Chương 5');
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

describe('useDocumentTitle', () => {
  it('ends the title with the site name and restores the previous one', () => {
    document.title = 'before';

    const { unmount } = renderHook(() => useDocumentTitle('Truyện'));

    expect(SITE_NAME).toBe('byZenQN');
    expect(document.title).toBe('Truyện · byZenQN');
    unmount();
    expect(document.title).toBe('before');
  });

  it('leaves the title alone while there is none', () => {
    document.title = 'before';

    renderHook(() => useDocumentTitle(null));

    expect(document.title).toBe('before');
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
