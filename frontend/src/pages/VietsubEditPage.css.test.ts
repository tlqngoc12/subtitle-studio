import { describe, expect, it } from 'vitest';
import { css } from '../test/css';

/** Declarations of the rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return '';
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
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
