import { describe, expect, it } from 'vitest';
import { css } from '../../test/css';

/** Declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
}

describe('calendar CSS', () => {
  // react-day-picker declares its blue defaults on .rdp-root itself, so brand variables set on a parent never win.
  it('sets the brand variables on .rdp-root, not on a parent that the library overrides', () => {
    const r = rule('.date-picker .rdp-root');
    expect(r).toMatch(/--rdp-accent-color:\s*var\(--brand-2\)/);
    expect(r).toMatch(/--rdp-today-color:\s*var\(--brand-ink\)/);
    expect(r).toMatch(/--rdp-accent-background-color:/);
  });

  it('draws the chevrons (nav buttons and dropdown carets) in the brand orange', () => {
    expect(rule('.date-picker .rdp-chevron')).toMatch(/fill:\s*var\(--brand-ink\)/);
  });

  it('tints a hovered nav button orange and rings a focused one', () => {
    expect(rule('.date-picker .rdp-button_previous:hover:not(:disabled),\n.date-picker .rdp-button_next:hover:not(:disabled)')).toMatch(
      /background:\s*color-mix\(in srgb, var\(--brand\)/,
    );
    expect(css).toMatch(/\.date-picker \.rdp-button_next:focus-visible/);
  });

  it('puts popovers, tooltips and selects above the dialogs (z-index 50/51) they open from', () => {
    for (const selector of ['.popover', '.tip', '.select__content']) {
      const z = Number(/z-index:\s*(\d+)/.exec(rule(selector))?.[1]);
      expect(z, selector).toBeGreaterThan(51);
    }
  });
});
