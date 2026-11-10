// All the project's own stylesheets as one string, for tests that read rules (contrast, truncation, layout).
// The order follows the bundle: the files `styles/index.css` imports first (tokens, then base), then the
// component and page files by path. Third-party CSS (fonts, lightbox) is not under src/ and is not included.
const modules = import.meta.glob('/src/**/*.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const FIRST = ['/src/styles/tokens.css', '/src/styles/base.css', '/src/styles/vietsub-lists.css'];

export const css: string = [
  ...FIRST.filter((path) => path in modules),
  ...Object.keys(modules)
    .filter((path) => !FIRST.includes(path) && path !== '/src/styles/index.css')
    .sort(),
]
  .map((path) => modules[path])
  .join('\n')
  .replace(/\r\n/g, '\n'); // a Windows checkout has CRLF line endings; the tests match on \n
