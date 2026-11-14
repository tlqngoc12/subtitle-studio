import { describe, expect, it } from 'vitest';
import { css } from '../../test/css';

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
}

describe('fixed Read bar on phones', () => {
  it('lets the read column shrink below its text, so a long chapter name cannot push the bar past the screen', () => {
    expect(rule('.novel-cta')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+48px/);
    expect(rule('.novel-cta__read')).toMatch(/min-width:\s*0/);
  });

  it('cuts a long chapter name with an ellipsis instead of overflowing', () => {
    const label = rule('.novel-cta__label');
    expect(label).toMatch(/overflow:\s*hidden/);
    expect(label).toMatch(/text-overflow:\s*ellipsis/);
    expect(label).toMatch(/white-space:\s*nowrap/);
  });

  it('keeps the site footer clear of the bar (the footer sits outside the page)', () => {
    expect(rule('body:has(.novel-cta)')).toMatch(/padding-bottom:/);
  });
});
