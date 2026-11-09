import { describe, expect, it } from 'vitest';
import { sortVietsub, withVietsub } from './vietsub';

type V = { id: string; viCueCount: number; viSource: 'AUTO' | 'MANUAL' | null; viUpdatedAt: string | null };
const v = (id: string, viSource: V['viSource'], viUpdatedAt: string | null, viCueCount = 5): V => ({ id, viCueCount, viSource, viUpdatedAt });

describe('sortVietsub', () => {
  it('puts AI first, then manual, newest first inside each group', () => {
    const sorted = sortVietsub([
      v('M new', 'MANUAL', '2026-11-02T12:00:00Z'),
      v('A old', 'AUTO', '2026-11-02T09:00:00Z'),
      v('A new', 'AUTO', '2026-11-02T11:00:00Z'),
      v('M old', 'MANUAL', '2026-11-02T08:00:00Z'),
    ]);

    expect(sorted.map((x) => x.id)).toEqual(['A new', 'A old', 'M new', 'M old']);
  });

  it('does not change the input array', () => {
    const input = [v('M', 'MANUAL', null), v('A', 'AUTO', null)];
    sortVietsub(input);
    expect(input.map((x) => x.id)).toEqual(['M', 'A']);
  });
});

describe('withVietsub', () => {
  it('drops videos without Vietsub and sorts the rest', () => {
    const result = withVietsub([v('none', null, null, 0), v('M', 'MANUAL', '2026-11-02T10:00:00Z'), v('A', 'AUTO', '2026-11-02T09:00:00Z')]);

    expect(result.map((x) => x.id)).toEqual(['A', 'M']);
  });
});
