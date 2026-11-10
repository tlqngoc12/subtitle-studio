import { describe, expect, it } from 'vitest';
import { css } from '../test/css';

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\]/g, '\$&');
  return new RegExp(`${escaped}\s*\{([^}]*)\}`).exec(css)?.[1] ?? '';
}

describe('Vietsub editor header CSS', () => {
  it('right-aligns the action group, also when it wraps below the title', () => {
    const r = rule('.vedit__actions');
    expect(r).toMatch(/margin-left:\s*auto/);
    expect(r).toMatch(/justify-content:\s*flex-end/);
  });

  it('lets a long title shrink inside the screen instead of widening the page', () => {
    expect(rule('.vedit')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });
});
