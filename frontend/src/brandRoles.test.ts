import { describe, expect, it } from 'vitest';
import { css } from './test/css';

/** Body of the first rule whose selector list is exactly `selector` (plain string search, no regex). */
function rule(selector: string): string {
  let from = 0;
  for (;;) {
    const at = css.indexOf(`${selector} {`, from);
    if (at < 0) throw new Error(`no rule for ${selector}`);
    const before = css[at - 1];
    if (at === 0 || before === '\n' || before === '}') {
      return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
    }
    from = at + 1;
  }
}

describe('colour roles in CSS', () => {
  it.each(['.button', '.filter-button', '.pager__link'])(
    '%s has an orange border at rest',
    (selector) => {
      expect(rule(selector === '.pager__link' ? '.pager__link,' + String.fromCharCode(10) + '.pager__break' : selector)).toMatch(/border(-color)?:[^;]*var\(--brand\)/);
    },
  );

  it('hover borders are orchid', () => {
    expect(rule('.button:hover:not(:disabled)')).toContain('var(--brand-2)');
    expect(rule('.pager__link:hover')).toContain('var(--brand-2)');
    expect(rule('.filter-button:hover,\n.filter-button--active')).toContain('var(--brand-2)');
  });

  it('disabled secondary buttons keep the neutral rule border', () => {
    expect(rule('.button:disabled')).toContain('var(--rule)');
  });

  it('no secondary button keeps a grey border at rest', () => {
    for (const selector of ['.button', '.filter-button', '.pager__link']) {
      expect(rule(selector === '.pager__link' ? '.pager__link,' + String.fromCharCode(10) + '.pager__break' : selector)).not.toMatch(/border(-color)?:[^;]*var\(--(rule|field-border)\)/);
    }
  });

  it('delete buttons are red at rest and on hover, never orange', () => {
    const rest = rule('.button--danger');
    expect(rest).toContain('var(--danger)');
    expect(rest).not.toContain('var(--brand');
    const hover = rule(
      '.button--danger:hover:not(:disabled)',
    );
    expect(hover).toContain('border-color: var(--danger)');
    expect(hover).toContain('background: var(--danger-bg)');
    expect(hover).not.toContain('var(--brand');
  });

  it('the negative-margin tab hack is gone', () => {
    expect(css).not.toContain('.page > .tabs__list');
    expect(css).not.toMatch(/margin-bottom:\s*calc\(var\(--space-3\)\s*-/);
  });

  it('plain links are orange ink, underlined, and orchid ink on hover', () => {
    expect(rule('a:not([class])')).toMatch(/color:\s*var\(--brand-ink\)/);
    expect(rule('a:not([class])')).toMatch(/text-decoration:\s*underline/);
    expect(rule('a:not([class]):hover')).toMatch(/color:\s*var\(--brand-2-ink\)/);
  });

  it('a tab bar sits 12px (--space-3) above its panel', () => {
    expect(rule('.tabs')).toMatch(/gap:\s*var\(--space-3\)/);
    expect(rule('.tabs__panel')).not.toMatch(/padding-top/);
  });
});
