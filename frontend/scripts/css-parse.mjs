// A tiny CSS reader for this project's stylesheets: top-level rules, @media/@supports blocks (one level),
// @keyframes and other at-rules. Enough for check-css-split.mjs; not a general parser.

/** Removes comments (keeping string contents) so braces inside them do not count. */
export function stripComments(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      while (j < css.length && css[j] !== q) j += css[j] === '\\' ? 2 : 1;
      out += css.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Index of the `}` that closes the `{` at `open`, ignoring braces inside strings. */
function matchBrace(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < css.length && css[i] !== q) i += css[i] === '\\' ? 2 : 1;
    } else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  throw new Error('Unbalanced braces');
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Parses CSS into a flat list of rules: { context, selector, decls, kind }.
 * `context` is the chain of enclosing at-rule preludes ("" at top level), e.g. "@media (max-width: 760px)".
 * `decls` is the normalised declaration text. Keyframes are one rule each (selector "@keyframes name", decls = body).
 */
export function parseRules(source) {
  const css = stripComments(source);
  const rules = [];
  (function walk(text, context) {
    let i = 0;
    while (i < text.length) {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (i >= text.length) break;
      if (text[i] === '@') {
        const semi = text.indexOf(';', i);
        const open = text.indexOf('{', i);
        if (open < 0 || (semi >= 0 && semi < open)) {
          rules.push({ context, selector: norm(text.slice(i, semi)), decls: '', kind: 'at' });
          i = semi + 1;
          continue;
        }
        const prelude = norm(text.slice(i, open));
        const close = matchBrace(text, open);
        const body = text.slice(open + 1, close);
        if (/^@(media|supports|layer)/.test(prelude)) walk(body, context ? `${context} ${prelude}` : prelude);
        else rules.push({ context, selector: prelude, decls: norm(body), kind: 'block' });
        i = close + 1;
      } else {
        const open = text.indexOf('{', i);
        const close = matchBrace(text, open);
        rules.push({
          context,
          selector: norm(text.slice(i, open)),
          decls: norm(text.slice(open + 1, close)),
          kind: 'rule',
        });
        i = close + 1;
      }
    }
  })(css, '');
  return rules;
}
