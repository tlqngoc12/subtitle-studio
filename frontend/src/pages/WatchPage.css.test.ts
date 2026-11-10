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

  it('shows the Vietsub at least 14px tall', () => {
    expect(rule('.overlay__line')).toMatch(/font-size:\s*clamp\(14px,/);
  });

  it('makes the player buttons 44px on phones', () => {
    expect(css).toMatch(/@media \(max-width: 760px\)\s*\{\s*\.player__btn\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/);
  });

  it('dims nothing but the thumbnail of a watched video and keeps the tick in brand ink', () => {
    expect(rule('.plpanel__seen')).toMatch(/color:\s*var\(--brand-ink\)/);
    expect(rule('.plpanel__item--watched img')).toMatch(/opacity:\s*0\.75/);
  });
});
