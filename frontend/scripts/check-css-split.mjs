#!/usr/bin/env node
// Verifies that splitting src/styles.css into tokens, base and co-located component files lost or duplicated nothing.
//
//   node scripts/check-css-split.mjs <base-commit>
//
// <base-commit> is a commit whose frontend/src/styles.css is the stylesheet before the split. The script reads it
// with `git show <base>:frontend/src/styles.css`, reads every .css file under src/ now, and compares the rules as
// (context, selector, declarations) triples. A selector list counts as one rule per selector, and the context is
// the enclosing @media/@supports prelude, so a block that moved or was split between files still matches.
// Exit code 1 when a rule is missing, duplicated, or new without being listed in INTENDED below.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRules } from './css-parse.mjs';

const base = process.argv[2];
if (!base) {
  console.error('Usage: node scripts/check-css-split.mjs <base-commit>');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src');

/** Selectors whose rules legitimately differ from the base commit, with the reason. */
const INTENDED = {
  '.popover': 'new: the look the three popovers shared (PopoverPanel)',
  '.saveto': 'popover consolidation: shared declarations moved to .popover',
  '.filter-menu': 'popover consolidation: shared declarations moved to .popover',
  '.reader-pop': 'popover consolidation: shared declarations moved to .popover',
  '.novel-card__title': 'now an h3: margin and font-size reset',
  '.reader__end-nav': 'two-column grid instead of flex with empty spacers',
  '.reader__end-button': 'justify-self: start for the grid',
  '.reader__end-button--next': 'new: next sits in column 2, justify-self: end',
};

const ALLOWED_MEDIA = [
  /^@media \(max-width: (520|760)px\)$/,
  /^@media \(min-width: (521|760|761|1024)px\)$/,
  /^@media \(prefers-(color-scheme: dark|reduced-motion: reduce)\)$/,
  /^@media print$/,
];

function cssFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return cssFiles(p);
    return name.endsWith('.css') ? [p] : [];
  });
}

function splitSelectors(selector) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const c of selector) {
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  parts.push(cur.trim());
  return parts;
}

/** Map of "context | selector | decls" -> { count, files } */
function collect(sources) {
  const map = new Map();
  const contexts = new Set();
  for (const [file, text] of sources) {
    for (const rule of parseRules(text)) {
      if (rule.kind === 'at' && rule.selector.startsWith('@import')) continue; // index.css only wires the files
      if (rule.context) contexts.add(rule.context);
      const selectors = rule.kind === 'rule' ? splitSelectors(rule.selector) : [rule.selector];
      for (const selector of selectors) {
        const key = `${rule.context} | ${selector} | ${rule.decls}`;
        const entry = map.get(key) ?? { count: 0, files: [], context: rule.context, selector, decls: rule.decls };
        entry.count++;
        entry.files.push(file);
        map.set(key, entry);
      }
    }
  }
  return { map, contexts };
}

const oldCss = execFileSync('git', ['show', `${base}:frontend/src/styles.css`], { encoding: 'utf8', maxBuffer: 1 << 26 });
const files = cssFiles(src);
const before = collect([['styles.css', oldCss]]);
const after = collect(files.map((f) => [relative(src, f).replaceAll('\\', '/'), readFileSync(f, 'utf8')]));

const problems = [];
const intended = [];
const where = (e) => `${e.context ? e.context + ' ' : ''}${e.selector}`;

for (const [key, e] of before.map) {
  const now = after.map.get(key);
  if (!now) continue;
  if (now.count < e.count) problems.push(`MISSING ${where(e)} (${e.count} before, ${now.count} now)`);
  if (now.count > e.count) problems.push(`DUPLICATED ${where(e)} (${e.count} before, ${now.count} now: ${now.files.join(', ')})`);
}
const decls = (e) => e.decls.split(';').map((d) => d.trim()).filter(Boolean);
const note = (e, kind) => {
  const reason = INTENDED[e.selector];
  if (reason) intended.push(`${kind === 'removed' ? '-' : '+'} ${where(e)}  [${reason}]
      ${decls(e).join('; ')}`);
  else problems.push(`${kind === 'removed' ? 'MISSING' : 'NEW'} ${where(e)}: ${e.decls.slice(0, 80)}`);
};
for (const [key, e] of before.map) if (!after.map.has(key)) note(e, 'removed');
for (const [key, e] of after.map) if (!before.map.has(key)) note(e, 'added');

for (const ctx of after.contexts) {
  if (!ALLOWED_MEDIA.some((re) => re.test(ctx))) problems.push(`BREAKPOINT outside the 520/760/1024 convention: ${ctx}`);
}

const total = (m) => [...m.values()].reduce((n, e) => n + e.count, 0);
console.log(`base ${base}: ${total(before.map)} rule(s) in styles.css`);
console.log(`now: ${total(after.map)} rule(s) in ${files.length} file(s)`);
console.log(`media contexts: ${[...after.contexts].sort().join('; ')}`);
console.log(`\nintended differences (${intended.length}):`);
for (const line of intended.sort()) console.log(`  ${line}`);
console.log(`\nproblems (${problems.length}):`);
for (const line of problems) console.log(`  ${line}`);
if (problems.length === 0) console.log('  none: every rule exists exactly once; nothing new except the intended differences');
process.exit(problems.length === 0 ? 0 : 1);
