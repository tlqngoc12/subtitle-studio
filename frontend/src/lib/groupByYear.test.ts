import { describe, expect, it } from 'vitest';
import { groupByYear } from './groupByYear';

describe('groupByYear', () => {
  it('puts undated first, then years descending, keeping order inside a group', () => {
    const items = [
      { id: 1, d: '2025-03-01' },
      { id: 2, d: null },
      { id: 3, d: '2026-01-05' },
      { id: 4, d: '2025-12-31' },
      { id: 5, d: '2026-11-09' },
    ];
    const groups = groupByYear(items, (i) => i.d);
    expect(groups.map((g) => g.label)).toEqual(['Coming Soon', '2026', '2025']);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([[2], [3, 5], [1, 4]]);
  });

  it('returns no groups for an empty list', () => {
    expect(groupByYear([], () => null)).toEqual([]);
  });
});
