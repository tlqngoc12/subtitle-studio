import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import publicHtml from '../../public.html?raw';
import { css } from '../test/css';

describe('site logo', () => {
  it.each([
    ['index.html', indexHtml],
    ['public.html', publicHtml],
  ])('%s uses the logo as favicon and apple-touch-icon', (_name, html) => {
    expect(html).toMatch(/<link rel="icon" type="image\/webp" href="\/logo\.webp"\s*\/?>/);
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/logo\.webp"\s*\/?>/);
  });

  it('sizes the brand logo 28px on desktop and 24px on a phone, 8px from the name', () => {
    const base = /\.topbar__logo\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(base).toMatch(/height:\s*24px/);
    expect(/\.topbar__brand\s*\{([^}]*)\}/.exec(css)?.[1]).toMatch(/gap:\s*8px/);
    expect(css).toMatch(/@media \(min-width: 521px\)\s*\{\s*\.topbar__logo\s*\{\s*height:\s*28px/);
  });
});
