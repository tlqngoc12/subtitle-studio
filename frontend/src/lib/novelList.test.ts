import { describe, expect, it } from 'vitest';
import { filterNovels, sortNovels, type NovelListItem } from './novelList';

const n = (over: Partial<NovelListItem> & { slug: string }): NovelListItem => ({
  title: over.slug,
  novelStatus: 'ONGOING',
  updatedAt: '2026-11-01T00:00:00Z',
  ...over,
});

const ITEMS: NovelListItem[] = [
  n({ slug: 'cho-dem', title: 'Chợ Đêm', originalAuthor: 'Minh Anh', tags: ['gl'], novelStatus: 'COMPLETED' }),
  n({ slug: 'second', title: 'Second Spring', originalAuthor: 'Rina', tags: ['fluff', 'bl'] }),
  n({ slug: 'winter', title: 'Winter', originalAuthor: null }),
];

describe('filterNovels', () => {
  it('searches title, author, tags and slug without accents or case', () => {
    expect(filterNovels(ITEMS, 'cho dem', 'all').map((x) => x.slug)).toEqual(['cho-dem']);
    expect(filterNovels(ITEMS, 'RINA', 'all').map((x) => x.slug)).toEqual(['second']);
    expect(filterNovels(ITEMS, 'fluff', 'all').map((x) => x.slug)).toEqual(['second']);
    expect(filterNovels(ITEMS, 'winter', 'all').map((x) => x.slug)).toEqual(['winter']);
    expect(filterNovels(ITEMS, '  ', 'all')).toHaveLength(3);
  });

  it('filters by status and combines it with the query', () => {
    expect(filterNovels(ITEMS, '', 'completed').map((x) => x.slug)).toEqual(['cho-dem']);
    expect(filterNovels(ITEMS, '', 'ongoing').map((x) => x.slug)).toEqual(['second', 'winter']);
    expect(filterNovels(ITEMS, 'rina', 'completed')).toEqual([]);
  });
});

describe('sortNovels', () => {
  it('sorts by the latest published chapter, else the update time, newest first', () => {
    const items = [
      n({ slug: 'c', updatedAt: '2026-11-12T00:00:00Z', lastPublishedAt: '2026-10-01T00:00:00Z' }),
      n({ slug: 'b', updatedAt: '2026-11-05T00:00:00Z' }),
      n({ slug: 'a', updatedAt: '2026-11-01T00:00:00Z', lastPublishedAt: '2026-11-10T00:00:00Z' }),
    ];
    expect(sortNovels(items, 'updated', null).map((x) => x.slug)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by reads with unknown reads last', () => {
    const items = [n({ slug: 'a' }), n({ slug: 'b' }), n({ slug: 'c' })];
    expect(sortNovels(items, 'read', { b: 50, c: 900 }).map((x) => x.slug)).toEqual(['c', 'b', 'a']);
    expect(sortNovels(items, 'read', null).map((x) => x.slug)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by creation time with missing times last', () => {
    const items = [
      n({ slug: 'old', createdAt: '2026-01-01T00:00:00Z' }),
      n({ slug: 'none' }),
      n({ slug: 'new', createdAt: '2026-11-01T00:00:00Z' }),
    ];
    expect(sortNovels(items, 'added', null).map((x) => x.slug)).toEqual(['new', 'old', 'none']);
  });

  it('sorts by title A-Z in Vietnamese order and does not change the input', () => {
    const items = [n({ slug: 'x', title: 'Đêm' }), n({ slug: 'y', title: 'Dưa' }), n({ slug: 'z', title: 'Ánh' })];
    const before = items.map((x) => x.slug);
    expect(sortNovels(items, 'title', null).map((x) => x.title)).toEqual(['Ánh', 'Dưa', 'Đêm']);
    expect(items.map((x) => x.slug)).toEqual(before);
  });
});
