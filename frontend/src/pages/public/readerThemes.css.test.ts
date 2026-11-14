import { describe, expect, it } from 'vitest';
import { css } from '../../test/css';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('reader themes', () => {
  it('maps --ink/--muted to the reader colours for the end-of-chapter block that sits on the paper', () => {
    const rule = /([^{}]*)\{([^}]*--ink:\s*var\(--reader-ink\)[^}]*)\}/.exec(css);
    expect(rule?.[1]).toContain('html[data-reader-theme] .reader__end');
    expect(rule?.[2]).toMatch(/--muted:\s*var\(--reader-muted\)/);
  });

  it.each(['light', 'sepia', 'dark', 'oled'])('%s: reader ink on reader paper has at least 4.5:1 contrast', (theme) => {
    const block = new RegExp(`\\[data-reader-theme="${theme}"\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    const ink = /--reader-ink:\s*(#[0-9A-Fa-f]{6})/.exec(block)?.[1];
    const paper = /--reader-paper:\s*(#[0-9A-Fa-f]{6})/.exec(block)?.[1];
    expect(ink).toBeDefined();
    expect(paper).toBeDefined();
    expect(contrast(ink!, paper!)).toBeGreaterThanOrEqual(4.5);
  });
});
