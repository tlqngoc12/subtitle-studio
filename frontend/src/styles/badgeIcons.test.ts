import { describe, expect, it } from 'vitest';

// Orange "done" and purple "in progress" badges differ by hue only, which colour-blind readers cannot see, so each
// one starts with an icon.
const sources = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const files = Object.entries(sources).filter(([path]) => !path.endsWith('.test.tsx'));

describe('done and in-progress badges', () => {
  it('finds the badges it checks', () => {
    expect(files.map(([, source]) => source).join('\n')).toMatch(/<span className="badge badge--done"/);
  });

  it('start with an icon', () => {
    const missing: string[] = [];
    for (const [path, source] of files) {
      for (const m of source.matchAll(/<(span|p) className="badge badge--(?:done|progress)"[^>]*>([\s\S]*?)<\/\1>/g)) {
        if (!/^\s*<[A-Z]\w*\s+className="icon/.test(m[2])) missing.push(`${path}: ${m[2].trim().slice(0, 40)}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
