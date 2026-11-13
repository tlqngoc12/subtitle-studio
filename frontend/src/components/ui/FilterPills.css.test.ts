import { describe, expect, it } from 'vitest';
import { css } from '../../test/css';

/** Declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
}

describe('selected-state CSS', () => {
  const ring = /border-color:\s*var\(--brand-2-ink\)/;

  it('draws the chosen filter pill solid purple with a ring and bold text', () => {
    const r = rule(".filter-pills__pill[aria-pressed='true']");
    expect(r).toMatch(ring);
    expect(r).toMatch(/background:\s*var\(--brand-2\)\s*;/);
    expect(r).toMatch(/color:\s*var\(--on-brand\)/);
    expect(r).toMatch(/font-weight:\s*700/);
  });

  it('leaves the unselected pills with the orange button border', () => {
    expect(rule('.filter-pills__pill')).not.toMatch(/border/);
  });

  it('gives the pills a 40 px height on phones', () => {
    expect(css).toMatch(/@media \(max-width: 520px\)\s*\{\s*\.filter-pills__pill\s*\{\s*height:\s*var\(--control-m\)/);
  });

  it('gives the nav pill and the active page link the same ring', () => {
    expect(css).toMatch(/\.nav__pill \{[^}]*border:\s*1px solid var\(--brand-2-ink\)/);
    expect(rule('.pager__link--active')).toMatch(ring);
  });
});
