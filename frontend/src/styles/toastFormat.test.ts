import { describe, expect, it } from 'vitest';

// One toast format: a short title with no trailing period or ellipsis, specifics in the description, the type
// following the meaning (success = finished, info = started, warning = partial, error via toastError).
const sources = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const files = Object.entries(sources).filter(([path]) => !/\.test\.tsx?$/.test(path));

function offenders(pattern: RegExp): string[] {
  const found: string[] = [];
  for (const [path, source] of files) for (const m of source.matchAll(pattern)) found.push(`${path}: ${m[0]}`);
  return found;
}

describe('toast format', () => {
  it('finds the toast calls it checks', () => {
    expect(files.map(([, source]) => source).join('\n')).toMatch(/toast\.success\(/);
  });

  it('has no plain toast() or toast.message() calls', () => {
    expect(offenders(/\btoast\(|\btoast\.message\(/g)).toEqual([]);
  });

  it('has no toast title that ends in a period or an ellipsis', () => {
    expect(offenders(/toast\.(?:success|info|warning|error)\(\s*['"`][^'"`]*[.…]['"`]/g)).toEqual([]);
  });

  it('has no success title built from a template literal with a value (specifics go in the description)', () => {
    expect(offenders(/toast\.success\(\s*`[^`]*\$\{/g)).toEqual([]);
  });
});
