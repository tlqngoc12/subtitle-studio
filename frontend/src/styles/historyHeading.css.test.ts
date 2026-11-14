import { describe, expect, it } from 'vitest';
import { css } from '../test/css';

/** Declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
}

describe('section heading accent', () => {
  it('draws a short orange bar under every section heading', () => {
    const bar = rule('.history__heading::after');
    expect(bar).toMatch(/background:\s*var\(--brand\)/);
    expect(bar).toMatch(/height:\s*3px/);
    expect(bar).toMatch(/width:\s*24px/);
    expect(bar).toMatch(/display:\s*block/);
  });
});
