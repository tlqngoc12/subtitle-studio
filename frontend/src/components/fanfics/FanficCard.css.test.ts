import { describe, expect, it } from 'vitest';
import { css } from '../../test/css';

/** Declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
}

describe('card orange emphasis', () => {
  it('fills the Complete badge with orange, not purple', () => {
    const badge = rule('.fanfic-card__badge--complete');
    expect(badge).toMatch(/background:\s*var\(--brand\)\s*;/);
    expect(badge).not.toContain('--brand-2');
  });

  it('colours the stat icons orange while the label text stays muted', () => {
    expect(rule('.fanfic-stat__label .icon')).toMatch(/color:\s*var\(--brand-ink\)/);
  });
});
