/**
 * The review file of a chapter (written by the story-reviewer agent): markdown tables with the columns `Mục`,
 * `Đoạn cũ`, `Đoạn mới`. `parseReview` reads the rows; `findReviewIssues` finds each "Đoạn cũ" in the chapter text as
 * an ordinary check `Issue`, so the marks, the popover and applying work like Check.
 * Spec: docs/superpowers/specs/2026-11-23-chapter-review-file-design.md.
 */
import type { Issue } from './checkRules';

export interface ReviewRow {
  /** The item label, such as `🔴1`. */
  item: string;
  /** The passage to find, copied from the chapter. */
  old: string;
  /** What to put instead; an empty string deletes the passage. */
  replacement: string;
}

export interface ReviewScan {
  /** One hit for every place a row's old text stands in the chapter, sorted by `start`. */
  issues: Issue[];
  /** Rows whose old text is gone and whose new text (or a deletion) is already done. */
  done: ReviewRow[];
  /** Rows with neither the old nor the new text in the chapter. */
  notFound: ReviewRow[];
}

const COLUMNS = { item: 'mục', old: 'đoạn cũ', replacement: 'đoạn mới' };
const SEPARATOR_CELL = /^:?-{1,}:?$/;
const DELETE = new Set(['(xoá)', '(xóa)']);

/** The cells of a table line: split at every `|` that is not `\|`, without the outer pipes. */
function splitCells(line: string): string[] {
  const body = line.trim().replace(/^\|/, '');
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\' && body[i + 1] === '|') {
      current += '\\|';
      i++;
    } else if (ch === '|') {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') cells.push(current);
  return cells;
}

function decode(cell: string): string {
  return cell
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\\|/g, '|')
    .trim();
}

const headerName = (cell: string) => cell.replace(/[*_`]/g, '').trim().normalize('NFC').toLowerCase();

/** Every table whose header has `Mục`, `Đoạn cũ` and `Đoạn mới` (any order, other columns ignored), in file order. */
export function parseReview(markdown: string): ReviewRow[] {
  const lines = markdown.split(/\r?\n/);
  const rows: ReviewRow[] = [];
  let columns: { item: number; old: number; replacement: number } | null = null;
  for (const line of lines) {
    if (!line.trim().startsWith('|')) {
      columns = null;
      continue;
    }
    const cells = splitCells(line);
    if (columns === null) {
      const names = cells.map(headerName);
      const item = names.indexOf(COLUMNS.item);
      const old = names.indexOf(COLUMNS.old);
      const replacement = names.indexOf(COLUMNS.replacement);
      if (item >= 0 && old >= 0 && replacement >= 0) columns = { item, old, replacement };
      continue;
    }
    if (cells.length > 0 && cells.every((c) => SEPARATOR_CELL.test(c.trim()))) continue;
    const old = decode(cells[columns.old] ?? '');
    if (old === '') continue;
    let replacement = decode(cells[columns.replacement] ?? '');
    if (DELETE.has(replacement.toLowerCase())) replacement = '';
    rows.push({ item: decode(cells[columns.item] ?? ''), old, replacement });
  }
  return rows;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A literal match of `needle`: any run of whitespace matches any run, and the straight and curly quotes match each other. */
function literal(needle: string): RegExp | null {
  const parts = needle.normalize('NFC').trim().split(/\s+/).filter((p) => p !== '');
  if (parts.length === 0) return null;
  const source = parts
    .map((part) =>
      [...part].map((ch) => (ch === '"' || ch === '“' || ch === '”' ? '["“”]' : escapeRegex(ch))).join(''),
    )
    .join('\\s+');
  return new RegExp(source, 'gu');
}

/**
 * Where each row's old text stands in `text`. Case-sensitive. Where hits overlap, the one that starts first wins, and
 * the longer one on a tie (the marks behind the textarea cannot paint two on the same words).
 * The text is matched as it is: the editor's text is already NFC, so offsets are the same as in the original.
 */
export function findReviewIssues(text: string, rows: ReviewRow[]): ReviewScan {
  const hay = text.normalize('NFC');
  const hits: Issue[] = [];
  const done: ReviewRow[] = [];
  const notFound: ReviewRow[] = [];
  for (const row of rows) {
    const rule = { wrong: row.old, suggestions: [row.replacement], reason: row.item };
    const re = literal(row.old);
    let count = 0;
    if (re) {
      for (const m of hay.matchAll(re)) {
        hits.push({ start: m.index, end: m.index + m[0].length, rule });
        count++;
      }
    }
    if (count > 0) continue;
    const replacementRe = row.replacement === '' ? null : literal(row.replacement);
    if (row.replacement === '' || (replacementRe && new RegExp(replacementRe.source, 'u').test(hay))) done.push(row);
    else notFound.push(row);
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const issues: Issue[] = [];
  for (const hit of hits) {
    const last = issues[issues.length - 1];
    if (!last || hit.start >= last.end) issues.push(hit);
  }
  return { issues, done, notFound };
}
