import { describe, expect, it } from 'vitest';
import admin from '../../index.html?raw';
import pub from '../../public.html?raw';
import { css } from '../test/css';

/** Declarations of the rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) return '';
  return css.slice(start, css.indexOf('}', start));
}

describe('iPhone safe area', () => {
  it('lets both pages draw under the notch (viewport-fit=cover) and keeps content clear of it', () => {
    expect(admin).toContain('viewport-fit=cover');
    expect(pub).toContain('viewport-fit=cover');
    expect(rule('body')).toMatch(/env\(safe-area-inset-left\)/);
  });

  it('fills the whole viewport by inset (never 100vw) and only offsets our own buttons by the safe area', () => {
    const r = rule('.player--filled');
    expect(r).not.toMatch(/100vw/);
    expect(r).not.toMatch(/100d?vh/);
    expect(r).toMatch(/inset:\s*0/);
    expect(r).not.toMatch(/padding/);
    // The YouTube iframe covers the whole screen, so YouTube measures it at its real size.
    expect(rule('.player--filled .player__video')).toBe('');
    expect(rule('.player--filled .player__tools')).toMatch(/var\(--safe-right\)/);
  });
});
