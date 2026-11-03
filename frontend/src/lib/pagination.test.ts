import { describe, expect, it } from 'vitest';
import { PAGE_SIZE, paginate, parsePage } from './pagination';

const items = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('paginate', () => {
  it('uses 10 items per page', () => {
    expect(PAGE_SIZE).toBe(10);
  });

  it('returns the requested page', () => {
    const r = paginate(items(25), 2);
    expect(r).toEqual({ page: 2, pageCount: 3, items: items(20).slice(10) });
  });

  it('returns a short last page', () => {
    expect(paginate(items(25), 3).items).toEqual([21, 22, 23, 24, 25]);
  });

  it('clamps a page past the end to the last page', () => {
    const r = paginate(items(11), 5);
    expect(r.page).toBe(2);
    expect(r.items).toEqual([11]);
  });

  it('clamps a page below 1 to the first page', () => {
    expect(paginate(items(3), 0).page).toBe(1);
  });

  it('has a single page when there are 10 items or fewer', () => {
    expect(paginate(items(10), 1).pageCount).toBe(1);
    expect(paginate(items(0), 1)).toEqual({ page: 1, pageCount: 1, items: [] });
  });
});

describe('parsePage', () => {
  it('reads a positive integer', () => {
    expect(parsePage('3')).toBe(3);
  });

  it.each([null, '', 'abc', '0', '-2', '1.5', '2x'])('falls back to 1 for %j', (raw) => {
    expect(parsePage(raw)).toBe(1);
  });
});
