import { describe, expect, it } from 'vitest';
import { css } from '../../test/css';

describe('reader bar buttons', () => {
  it('keep the app\'s control corner radius (no pill/circle) so they match the square top bar', () => {
    expect(css).not.toMatch(/\.reader-bar[^{]*\.button--icon[^{]*\{[^}]*border-radius/);
    const icon = /\.button \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(icon).toMatch(/border-radius:\s*var\(--radius-control\)/);
  });
});
