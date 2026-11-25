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

describe('Vietsub editor typing layout CSS', () => {
  it('shrinks the player to 110 px tall, centred, while typing', () => {
    expect(css).toMatch(/--vedit-mini-h:\s*110px/);
    const r = rule('.vedit--typing .vedit__player');
    expect(r).toMatch(/width:\s*calc\(var\(--vedit-mini-h\)\s*\*\s*16\s*\/\s*9\)/);
    expect(r).toMatch(/margin-inline:\s*auto/);
  });

  it('sizes the table from the visible height while typing', () => {
    expect(rule('.vedit--typing .vedit__body')).toMatch(/--cue-table-max:\s*calc\(var\(--vv-height/);
  });
});
