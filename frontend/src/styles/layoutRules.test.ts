import { describe, expect, it } from 'vitest';
import { css } from '../test/css';

// Guards docs/ui/screen-layout.md: a new screen that writes its own <main>, <h1>, back link or form bar fails here.

const modules = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Source without comments, so a comment that mentions `<main>` is not a violation. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

const files = Object.entries(modules)
  .filter(([path]) => !path.endsWith('.test.tsx') && !path.startsWith('/src/components/ui/'))
  .map(([path, source]) => ({ path, source: code(source) }));

const offenders = (match: (file: { path: string; source: string }) => boolean) => files.filter(match).map((f) => f.path);

describe('screen layout rules', () => {
  it('scans the app sources', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((f) => f.path === '/src/pages/NovelPage.tsx')).toBe(true);
  });

  it('writes no <main> by hand: screens render <Page>', () => {
    expect(offenders((f) => /<main[\s>]/.test(f.source))).toEqual([]);
  });

  it('writes no <h1> by hand in a page: titles go through <PageHeader> (the reader keeps its own)', () => {
    expect(
      offenders((f) => f.path.startsWith('/src/pages/') && f.path !== '/src/pages/public/ReaderPage.tsx' && /<h1[\s>]/.test(f.source)),
    ).toEqual([]);
  });

  it('has no back link: breadcrumbs replace "Back to ..."', () => {
    expect(offenders((f) => f.source.includes('back-link'))).toEqual([]);
    expect(css).not.toMatch(/\.back-link/);
  });

  it('writes no form button bar by hand: use <FormActions>', () => {
    expect(offenders((f) => f.source.includes('className="form-actions'))).toEqual([]);
  });

  it('no longer has the Filter popover for sources', () => {
    expect(offenders((f) => /SourceFilter/.test(f.source))).toEqual([]);
  });
});
