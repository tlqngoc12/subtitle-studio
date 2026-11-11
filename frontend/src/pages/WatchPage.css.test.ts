import { describe, expect, it } from 'vitest';
import { css } from '../test/css';

/** Declarations of the first rule whose selector contains `selector` (and, optionally, sits inside `media`). */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}[^{]*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
}

describe('watch page CSS', () => {
  it('keeps the player within the screen height, except when it fills the screen', () => {
    const r = rule('.watch__main > .player:not(:fullscreen):not(.player--filled)');
    expect(r).toMatch(/max-width:\s*calc\(\(100dvh[^;]*\)\s*\*\s*16\s*\/\s*9\)/);
  });

  it('shows the Vietsub at least 14px tall, times the caption scale', () => {
    expect(rule('.overlay__line')).toMatch(/font-size:\s*calc\(clamp\(14px,[^;]*\)\s*\*\s*var\(--caption-scale,\s*1\)\)/);
  });

  it('lets the player use the full width in theater mode and moves the playlist under it', () => {
    expect(rule('.watch--theater > .watch__main > .player:not(:fullscreen):not(.player--filled)')).toMatch(/max-width:\s*none/);
    expect(rule('.watch--theater.watch--playlist')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it('paints the active theater button purple', () => {
    expect(rule('.player__btn[aria-pressed=\'true\']')).toMatch(/background:\s*var\(--brand-2\)/);
  });

  it('makes the caption size options medium-control (40px) tall with the selected one purple', () => {
    expect(rule('.shortcuts__option')).toMatch(/min-height:\s*var\(--control-m\)/);
    expect(rule('.shortcuts__option[aria-checked=\'true\']')).toMatch(/--brand-2/);
  });

  it('makes the player buttons 44px on phones', () => {
    expect(css).toMatch(/@media \(max-width: 760px\)\s*\{\s*\.player__btn\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/);
  });

  it('dims nothing but the thumbnail of a watched video and keeps the tick in brand ink', () => {
    expect(rule('.plpanel__seen')).toMatch(/color:\s*var\(--brand-ink\)/);
    expect(rule('.plpanel__item--watched img')).toMatch(/opacity:\s*0\.75/);
  });
});
