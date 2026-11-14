import { describe, expect, it } from 'vitest';
import { css } from './test/css';

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const tokens: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
  return tokens;
}

const light = block(':root');
const dark = { ...light, ...block(":root[data-theme='dark']") };

function resolve(tokens: Record<string, string>, name: string): string {
  const value = tokens[name];
  if (value === undefined) throw new Error(`missing token ${name}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  return ref ? resolve(tokens, ref[1]) : value;
}

function luminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`not a 6-digit hex: ${hex}`);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(tokens: Record<string, string>, fg: string, bg: string): number {
  const a = luminance(resolve(tokens, fg));
  const b = luminance(bg.startsWith('#') ? bg : resolve(tokens, bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const themes = { light, dark };

describe.each(Object.entries(themes))('WCAG contrast, %s theme', (_name, tokens) => {
  it.each([
    // Body text: AAA.
    ['--ink', '--paper', 7],
    ['--ink', '--surface', 7],
    ['--muted', '--paper', 4.5],
    ['--muted', '--surface', 4.5],
    ['--brand-ink', '--paper', 4.5],
    ['--brand-ink', '--surface', 4.5],
    ['--brand-2-ink', '--paper', 4.5],
    ['--brand-2-ink', '--surface', 4.5],
    ['--on-brand', '--brand', 4.5],
    ['--on-brand', '--brand-hover', 4.5],
    ['--field-border', '--paper', 3],
    ['--field-border', '--surface', 3],
    // Borders of brand-coloured components (WCAG 1.4.11); --brand and --brand-2 stay fills.
    ['--brand-border', '--paper', 3],
    ['--brand-border', '--surface', 3],
    ['--brand-2-border', '--paper', 3],
    ['--brand-2-border', '--surface', 3],
    // Delete buttons keep a red border at rest; --danger is also used as text.
    ['--danger', '--paper', 4.5],
    ['--danger', '--surface', 4.5],
    // The keyboard focus ring (orchid).
    ['--focus', '--paper', 3],
    ['--focus', '--surface', 3],
    // The search box and URL field sit on the always-dark video frame, whose focus ring is --brand-2.
    ['--brand-2', '--frame', 3],
    ['--on-frame', '--frame', 7],
    // Text on the dark scrims over images and video (the scrims are semi-transparent black, so the worst case is the
    // frame colour).
    ['--on-scrim', '--video-bg', 7],
    ['--on-scrim', '--frame', 7],
  ])('%s on %s is at least %s:1', (fg, bg, min) => {
    expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

it('draws component borders with the 3:1 border tokens, never the light brand fills', () => {
  const offenders: string[] = [];
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = rule[2];
    for (const decl of body.matchAll(/(?:^|;|\n)\s*(border|border-color)\s*:\s*([^;]*var\((--brand(?:-2)?)\)[^;]*);/g)) {
      const token = decl[3];
      // A border in the same colour as the fill is invisible, so it may keep the fill token.
      if (new RegExp(`background(-color)?\\s*:\\s*var\\(${token}\\)\\s*;`).test(body)) continue;
      offenders.push(`${rule[1].trim().split('\n').pop()} { ${decl[1]}: ${decl[2].trim()} }`);
    }
  }
  expect(offenders).toEqual([]);
});

it('no stylesheet hard-codes a focus outline colour', () => {
  expect(css).not.toMatch(/outline(-color)?:[^;]*#[0-9a-f]{3,8}/i);
});

it('the film strip description bar keeps --on-frame text at 4.5:1 over even a white image', () => {
  expect(/\.filmstrip__bar\s*\{[^}]*background:\s*var\(--scrim-strong\)/.test(css)).toBe(true);
  const bar = /--scrim-strong:\s*rgb\(0 0 0 \/ ([\d.]+)\)/.exec(css);
  expect(bar).not.toBeNull();
  // Worst case: pure white under the bar, so the bar colour is white * (1 - alpha).
  const channel = Math.round(255 * (1 - Number(bar![1])))
    .toString(16)
    .padStart(2, '0');
  const worst = `#${channel}${channel}${channel}`;
  for (const tokens of Object.values(themes)) expect(ratio(tokens, '--on-frame', worst)).toBeGreaterThanOrEqual(4.5);
});

it('the current film strip dot is at least 3:1 against --paper in both themes (orchid fill plus --brand-2-ink ring)', () => {
  expect(css).toMatch(/\.filmstrip__dot\[aria-current='true'\]::before\s*\{[^}]*background:\s*var\(--brand-2\)[^}]*border:\s*2px solid var\(--brand-2-ink\)/);
  // The ring carries the 3:1 on the light paper; in dark --brand-2-ink is --brand-2 itself.
  for (const tokens of Object.values(themes)) expect(ratio(tokens, '--brand-2-ink', '--paper')).toBeGreaterThanOrEqual(3);
  expect(ratio(dark, '--brand-2', '--paper')).toBeGreaterThanOrEqual(3);
});
