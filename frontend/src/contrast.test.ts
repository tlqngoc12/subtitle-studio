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
    // Delete buttons keep a red border at rest; --danger is also used as text.
    ['--danger', '--paper', 4.5],
    ['--danger', '--surface', 4.5],
    // The keyboard focus ring (orchid).
    ['--focus', '--paper', 3],
    ['--focus', '--surface', 3],
    // The search box and URL field sit on the always-dark video frame, whose focus ring is --brand-2.
    ['--brand-2', '--frame', 3],
    ['--on-frame', '--frame', 7],
  ])('%s on %s is at least %s:1', (fg, bg, min) => {
    expect(ratio(tokens, fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

it('no stylesheet hard-codes a focus outline colour', () => {
  expect(css).not.toMatch(/outline(-color)?:[^;]*#[0-9a-f]{3,8}/i);
});

it('the film strip description bar keeps --on-frame text at 4.5:1 over even a white image', () => {
  const bar = /\.filmstrip__bar\s*\{[^}]*background:\s*rgb\(0 0 0 \/ ([\d.]+)\)/.exec(css);
  expect(bar).not.toBeNull();
  // Worst case: pure white under the bar, so the bar colour is white * (1 - alpha).
  const channel = Math.round(255 * (1 - Number(bar![1])))
    .toString(16)
    .padStart(2, '0');
  const worst = `#${channel}${channel}${channel}`;
  for (const tokens of Object.values(themes)) expect(ratio(tokens, '--on-frame', worst)).toBeGreaterThanOrEqual(4.5);
});
