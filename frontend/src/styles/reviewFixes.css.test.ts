import { describe, expect, it } from 'vitest';
import { css } from '../test/css';

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join('\n');
}

/** The text of every `@media (query) { … }` block (one nesting level), joined. */
function media(query: string): string {
  let out = '';
  let from = 0;
  for (;;) {
    const start = css.indexOf(`@media (${query})`, from);
    if (start < 0) return out;
    const open = css.indexOf('{', start);
    let depth = 0;
    let i = open;
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}' && --depth === 0) break;
    }
    out += css.slice(open + 1, i) + '\n';
    from = i;
  }
}

describe('UI review fixes: layout and colour', () => {
  it('B1: the chapter list column may shrink so a long chapter name ends in an ellipsis', () => {
    expect(rule('.chapter-list')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it('B3: the Shelf button when on uses the app-wide selected look, not orange text', () => {
    const on = rule('.novel-cta__shelf[aria-pressed="true"]');
    expect(on).toMatch(/background:\s*var\(--brand-2\)/);
    expect(on).toMatch(/color:\s*var\(--on-brand\)/);
    expect(on).toMatch(/border-color:\s*var\(--brand-2-ink\)/);
  });

  it('B4: the Publish file warning is readable orange text at the caption size', () => {
    const warning = rule('.publish__warning');
    expect(warning).toMatch(/color:\s*var\(--brand-ink\)/);
    expect(warning).toMatch(/font-size:\s*var\(--fs-caption\)/);
  });

  it('B7: on a phone the tab row is one scrolling line with faded edges', () => {
    const list = rule('.tabs__list');
    expect(list).toMatch(/flex-wrap:\s*nowrap/);
    expect(list).toMatch(/overflow-x:\s*auto/);
    expect(rule(".tabs__list[data-fade-end='true']")).toMatch(/mask-image/);
    expect(rule(".tabs__list[data-fade-start='true']")).toMatch(/mask-image/);
    expect(rule('.tabs__tab')).toMatch(/flex:\s*none/);
    expect(media('min-width: 761px')).toMatch(/\.tabs__list[^{]*\{[^}]*flex-wrap:\s*wrap/);
  });

  it('B9: on a phone the chapter text label has its own row above the buttons', () => {
    expect(rule('.chapter-text__head')).toMatch(/flex-direction:\s*column/);
    expect(media('min-width: 521px')).toMatch(/\.chapter-text__head\s*\{[^}]*flex-direction:\s*row/);
  });

  it('B10: no control that is on or selected uses an orange accent colour', () => {
    expect(css).not.toMatch(/accent-color:\s*var\(--brand\)/);
    expect(rule('.plpanel__autoplay input')).toMatch(/accent-color:\s*var\(--brand-2-ink\)/);
  });

  it('E3: touch screens get a 44px hit area for the top-bar links and the film strip dots', () => {
    const coarse = media('pointer: coarse');
    expect(coarse).toMatch(/\.nav__link::after/);
    expect(coarse).toMatch(/\.filmstrip__dot[^{]*\{[^}]*44px/);
  });
});
