import { describe, expect, it } from 'vitest';
import card from './FanficCard.css?raw';
import tab from './FanficsTab.css?raw';

/** The text of the first `@media (min-width: <px>px) { ... }` block, with balanced braces. */
function media(source: string, px: number): string {
  const start = source.indexOf(`@media (min-width: ${px}px)`);
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  return '';
}

/** Everything outside the min-width blocks: the phone styles. */
function base(source: string): string {
  let rest = source.replace(/\r\n/g, '\n');
  for (const px of [521, 761, 1024]) {
    const block = media(rest, px);
    if (block) rest = rest.replace(`@media (min-width: ${px}px) {${block}}`, '');
  }
  return rest;
}

const body = (source: string, selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(source)?.[1] ?? '';
};

describe('card stats CSS', () => {
  const phone = base(card);
  const wide = media(card, 521);

  it('is one wrapping inline row on a phone', () => {
    const stats = body(phone, '.fanfic-card__stats');
    expect(stats).toContain('display: flex');
    expect(stats).toContain('flex-wrap: wrap');
  });

  it('never breaks inside one stat (it wraps between items)', () => {
    expect(body(phone, '.fanfic-stat')).toContain('white-space: nowrap');
  });

  it('hides only the label text on a phone, and shows it again from 521px', () => {
    expect(body(phone, '.fanfic-stat__name')).toMatch(/clip/);
    expect(body(wide, '.fanfic-stat__name')).toContain('position: static');
    // The icon (the label's other child) is never hidden.
    expect(phone).not.toMatch(/\.fanfic-stat__label\s*\{[^}]*(clip|display: none)/);
  });

  it('separates the stats with a dot on a phone only', () => {
    expect(phone).toMatch(/\.fanfic-stat:not\(:last-child\)::after\s*\{[^}]*content: '·'/);
    expect(wide).toMatch(/\.fanfic-stat:not\(:last-child\)::after\s*\{[^}]*content: none/);
  });

  it('keeps the label-over-value grid with dividers from 521px up, and drops the unit there', () => {
    expect(phone).not.toMatch(/border-left: 1px/);
    expect(body(wide, '.fanfic-stat')).toContain('display: grid');
    expect(body(wide, '.fanfic-stat')).toContain('border-left: 1px solid var(--rule)');
    expect(body(wide, '.fanfic-stat__unit')).toContain('display: none');
  });
});

describe('card list CSS', () => {
  it('is two columns of full-width cards from 1024px, one column below', () => {
    expect(base(tab)).not.toMatch(/repeat\(2/);
    const list = body(media(tab, 1024), '.fanfic-list');
    expect(list).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(body(media(card, 1024), '.fanfic-card')).toContain('max-width: none');
  });
});
