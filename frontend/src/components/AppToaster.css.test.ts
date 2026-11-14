import { describe, expect, it } from 'vitest';
import { css } from '../test/css';

const rawModules = import.meta.glob('./AppToaster.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const own = Object.values(rawModules).join('\n');

describe('toast theme tokens', () => {
  it('sets sonner colour variables from the app tokens on the toast, so a forced data-theme is honoured', () => {
    const rule = /\[data-sonner-toast\]\.toast\s*\{([^}]*--normal-bg:[^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/--normal-bg:\s*var\(--surface\)/);
    expect(rule).toMatch(/--normal-text:\s*var\(--ink\)/);
    expect(rule).toMatch(/--normal-border:\s*var\(--rule\)/);
  });

  it('uses the overlay shadow, a muted description that wraps long names, and a brand-ink link', () => {
    // One attribute more than sonner's own [data-styled] rule, so it wins whatever the load order.
    expect(css).toMatch(/\[data-sonner-toast\]\[data-styled='true'\]\.toast\s*\{[^}]*box-shadow:\s*var\(--shadow-overlay\)/);
    const description = /\[data-sonner-toast\]\[data-styled='true'\]\.toast \[data-description\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(description).toMatch(/color:\s*var\(--muted\)/);
    expect(description).toMatch(/overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/\.toast \[data-description\] a\s*\{[^}]*color:\s*var\(--brand-ink\)/);
    expect(css).toMatch(/\.toast \[data-description\] a:hover\s*\{[^}]*color:\s*var\(--brand-2-ink\)/);
  });

  it('colours the close button from tokens', () => {
    const rule = /\[data-sonner-toast\]\[data-styled='true'\]\.toast \[data-close-button\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/background:\s*var\(--surface\)/);
    expect(rule).toMatch(/color:\s*var\(--ink\)/);
    expect(rule).toMatch(/border-color:\s*var\(--rule\)/);
  });

  it('has no hex colour in AppToaster.css', () => {
    expect(own.length).toBeGreaterThan(0);
    expect(own).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

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
