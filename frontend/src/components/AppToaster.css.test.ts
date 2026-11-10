import { describe, expect, it } from 'vitest';
import { css } from '../test/css';

describe('toast close button', () => {
  it('is placed top-right by overriding the variables sonner reads, not by specificity alone', () => {
    expect(css).toMatch(/\[data-sonner-toast\]\.toast\s*\{[^}]*--toast-close-button-start:\s*unset;[^}]*--toast-close-button-end:\s*0;/);
  });

  it('has an explicit rule that out-ranks sonner\'s [data-styled] one and covers every toast type', () => {
    const rule = css.match(/\[data-sonner-toast\]\[data-styled='true'\]\.toast \[data-close-button\]\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/right:\s*0/);
    expect(rule![1]).toMatch(/left:\s*auto/);
    // no per-type rule moves it back
    expect(css).not.toMatch(/data-type=[^{]*data-close-button\]\s*\{[^}]*left:\s*0/);
  });
});
