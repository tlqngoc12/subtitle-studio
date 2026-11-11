import { describe, expect, it } from 'vitest';

const modules = import.meta.glob('/src/**/*.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const strip = (text: string) => text.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const base = strip(modules['/src/styles/base.css']);
const tokens = strip(modules['/src/styles/tokens.css']);

interface Rule {
  selector: string;
  body: string;
}

function rules(text: string): Rule[] {
  const found: Rule[] = [];
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) found.push({ selector: m[1].trim(), body: m[2] });
  return found;
}

/** Body of the first rule whose selector list contains `selector` exactly. */
function bodyOf(text: string, selector: string): string {
  const hit = rules(text).find((r) => r.selector.split(',').map((s) => s.trim()).includes(selector));
  return hit?.body ?? '';
}

describe('control size scale', () => {
  it('defines the size and motion tokens', () => {
    for (const token of ['--control-s: 32px', '--control-m: 40px', '--control-l: 48px', '--dur-fast', '--ease-out', '--ease-in-out']) {
      expect(tokens).toContain(token);
    }
  });

  it('gives the three button sizes their token heights', () => {
    expect(bodyOf(base, '.button')).toMatch(/height:\s*var\(--control-m\)/);
    expect(bodyOf(base, '.button--s')).toMatch(/height:\s*var\(--control-s\)/);
    expect(bodyOf(base, '.button--l')).toMatch(/height:\s*var\(--control-l\)/);
  });

  it('has square icon buttons at 40 and 32', () => {
    expect(bodyOf(base, '.button--icon')).toMatch(/width:\s*var\(--control-m\)/);
    expect(bodyOf(base, '.button--icon.button--s')).toMatch(/width:\s*var\(--control-s\)/);
  });

  it('styles every text-like field at the medium height', () => {
    const field = rules(base).find((r) => r.selector.startsWith(':where(input:not('));
    expect(field, 'base field rule').toBeTruthy();
    expect(field!.selector).toContain('select');
    expect(field!.selector).toContain('textarea');
    expect(field!.selector).toContain('.field-control');
    expect(field!.body).toMatch(/height:\s*var\(--control-m\)/);
  });

  it('no longer has the old --small button', () => {
    expect(base).not.toContain('.button--small');
  });
});

/** Files that may size things that look like buttons: base styles, navbar pills, tabs, the reader bars. */
const ALLOWED = [/^\/src\/styles\//, /NavBar\.css$/, /Tab/, /Reader(Bar|BottomBar|Settings)\.css$/, /ImageLightbox\.css$/, /VideoPlayer\.css$/];
const SIZING = /(^|\n|;|\s)(height|min-height|padding|padding-block|padding-inline)\s*:/;

describe('component CSS does not size buttons itself', () => {
  it('has no height or padding on a selector containing "button" or "__btn"', () => {
    const offenders: string[] = [];
    for (const [path, raw] of Object.entries(modules)) {
      if (ALLOWED.some((re) => re.test(path))) continue;
      for (const r of rules(strip(raw))) {
        if (!/button|__btn/.test(r.selector)) continue;
        if (SIZING.test(r.body)) offenders.push(`${path}: ${r.selector}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('work editor link rows', () => {
  it('lay out on one line from 760 px: icon 120, label 180, URL 1fr, remove', () => {
    const at = strip(modules['/src/components/works/WorkEditor.css']);
    const block = at.slice(at.indexOf('@media (min-width: 760px)'));
    const row = rules(block).find((r) => r.selector === '.wed__link');
    expect(row?.body).toMatch(/grid-template-columns:\s*120px 180px minmax\(0, 1fr\) auto/);
    expect(row?.body).toMatch(/grid-template-areas:\s*'icon label url remove'/);
  });
});
