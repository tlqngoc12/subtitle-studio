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

  it('sizes the filled player by inset and pads it by the safe area, never by 100vw', () => {
    const r = rule('.player--filled');
    expect(r).not.toMatch(/100vw/);
    expect(r).not.toMatch(/100d?vh/);
    expect(r).toMatch(/inset:\s*0/);
    expect(r).toMatch(/env\(safe-area-inset-left\)/);
    expect(rule('.player--filled .player__video')).toMatch(/var\(--safe-left\)/);
  });
});
