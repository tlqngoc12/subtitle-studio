/**
 * The Check of a chapter: rules written in the novel profile's `## Kiểm tra` section, matched against the chapter text
 * in the browser (no Gemini). `parseCheckRules` reads the section; `findIssues` marks each whole-word hit;
 * `applySuggestion` swaps one hit for a suggestion. Spec: docs/superpowers/specs/2026-11-18-chapter-check-rules-design.md.
 */

export interface CheckRule {
  /** The phrase that is wrong in this novel. */
  wrong: string;
  /** Replacements to offer; empty means "flag only". */
  suggestions: string[];
  /** Why, shown in the popover (the trailing "(…)" of the rule line). */
  reason: string | null;
}

export interface CheckRules {
  rules: CheckRule[];
  /** Lines of the section that look like rules (start with "- ") but could not be read. */
  ignored: number;
}

/** One hit: `start`..`end` are offsets in the text that was checked. */
export interface Issue {
  start: number;
  end: number;
  rule: CheckRule;
}

const SECTION = /^##\s+Kiểm tra\s*$/iu;
const QUOTE = '["“”]';
const WRONG = new RegExp(`^${QUOTE}([^"“”]+)${QUOTE}\\s*(?:→|->)\\s*(.*)$`, 'u');
const SUGGESTION = new RegExp(`^${QUOTE}([^"“”]+)${QUOTE}\\s*`, 'u');
const FLAG_ONLY = /^tránh dùng$/iu;
const IMAGE_LINE = /^\[\[image:\d+\]\]\s*$/;

/** Reads the rules of the `## Kiểm tra` section (up to the next `## ` heading or the end). */
export function parseCheckRules(profile: string): CheckRules {
  const lines = profile.normalize('NFC').split(/\r?\n/);
  const start = lines.findIndex((l) => SECTION.test(l.trim()));
  const rules: CheckRule[] = [];
  let ignored = 0;
  if (start < 0) return { rules, ignored };
  for (const raw of lines.slice(start + 1)) {
    if (raw.startsWith('## ')) break;
    const bullet = /^\s*[-*]\s+(.*)$/u.exec(raw);
    if (!bullet) continue;
    const text = bullet[1].trim();
    if (text === '' || text.startsWith('(')) continue; // the template's hint line, or an empty bullet
    const rule = parseRule(text);
    if (rule) rules.push(rule);
    else ignored += 1;
  }
  return { rules, ignored };
}

function parseRule(text: string): CheckRule | null {
  const head = WRONG.exec(text);
  if (!head) return null;
  const wrong = head[1].trim();
  if (wrong === '') return null;
  let rest = head[2].trim();
  const suggestions: string[] = [];
  for (;;) {
    const quoted = SUGGESTION.exec(rest);
    if (!quoted) break;
    const suggestion = quoted[1].trim();
    if (suggestion !== '') suggestions.push(suggestion);
    rest = rest.slice(quoted[0].length);
    if (rest.startsWith('|')) rest = rest.slice(1).trimStart();
    else break;
  }
  let reason: string | null = null;
  while (rest !== '') {
    const group = /^\(([^()]*)\)\s*/u.exec(rest);
    if (!group) return null;
    const inner = group[1].trim();
    // "(tránh dùng)" only says "no replacement"; any other parenthesis is the reason.
    if (suggestions.length === 0 && FLAG_ONLY.test(inner)) {
      // flag only
    } else if (reason === null && inner !== '') {
      reason = inner;
    } else {
      return null;
    }
    rest = rest.slice(group[0].length);
  }
  return { wrong, suggestions, reason };
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
const JOINER = /^[-'’]$/;

function codePointBefore(s: string, index: number): string {
  if (index <= 0) return '';
  const low = s.charCodeAt(index - 1);
  if (low >= 0xdc00 && low <= 0xdfff && index >= 2) return s.slice(index - 2, index);
  return s.slice(index - 1, index);
}

function codePointAt(s: string, index: number): string {
  return index >= s.length ? '' : String.fromCodePoint(s.codePointAt(index) as number);
}

/** A word boundary: no letter or digit next to it, and no hyphen or apostrophe that joins it to one ("Cô-ca"). */
function isBoundaryBefore(s: string, index: number): boolean {
  const c = codePointBefore(s, index);
  if (c === '') return true;
  if (WORD_CHAR.test(c)) return false;
  return !(JOINER.test(c) && WORD_CHAR.test(codePointBefore(s, index - c.length)));
}

function isBoundaryAfter(s: string, index: number): boolean {
  const c = codePointAt(s, index);
  if (c === '') return true;
  if (WORD_CHAR.test(c)) return false;
  return !(JOINER.test(c) && WORD_CHAR.test(codePointAt(s, index + c.length)));
}

/** Lower case that never changes the length (a few characters such as "İ" would). */
function fold(s: string): string {
  let out = '';
  for (const ch of s) {
    const lower = ch.toLowerCase();
    out += lower.length === ch.length ? lower : ch;
  }
  return out;
}

interface Folded {
  /** NFC and lower case: what the rules are matched against. */
  text: string;
  /** For each index of `text`, where that character starts and ends in the original text. */
  origStart: number[] | null;
  origEnd: number[] | null;
}

/** NFC + lower case, with an index map back to the original when NFC changed the length. */
function foldWithMap(original: string): Folded {
  const nfc = original.normalize('NFC');
  if (nfc === original) return { text: fold(original), origStart: null, origEnd: null };
  const origStart: number[] = [];
  const origEnd: number[] = [];
  let text = '';
  let i = 0;
  while (i < original.length) {
    // One cluster: a character and the combining marks after it.
    let j = i + ((original.codePointAt(i) ?? 0) > 0xffff ? 2 : 1);
    while (j < original.length && /\p{M}/u.test(codePointAt(original, j))) j += codePointAt(original, j).length;
    const piece = fold(original.slice(i, j).normalize('NFC'));
    for (let k = 0; k < piece.length; k++) {
      origStart.push(i);
      origEnd.push(j);
    }
    text += piece;
    i = j;
  }
  return { text, origStart, origEnd };
}

/**
 * Every whole-word hit of `rules` in `text`, sorted by `start`. Case-insensitive and NFC on both sides; lines that
 * are only an `[[image:N]]` marker are skipped; where hits overlap, the longer one wins, then the earlier one.
 */
export function findIssues(text: string, rules: CheckRule[]): Issue[] {
  if (rules.length === 0 || text === '') return [];
  const folded = foldWithMap(text);
  const hay = folded.text;
  const skip = markerRanges(text);
  const found: Issue[] = [];
  for (const rule of rules) {
    const needle = fold(rule.wrong.normalize('NFC'));
    if (needle === '') continue;
    for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + 1)) {
      const to = at + needle.length;
      if (!isBoundaryBefore(hay, at) || !isBoundaryAfter(hay, to)) continue;
      const start = folded.origStart ? folded.origStart[at] : at;
      const end = folded.origEnd ? folded.origEnd[to - 1] : to;
      if (skip.some(([a, b]) => start < b && end > a)) continue;
      found.push({ start, end, rule });
    }
  }
  found.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: Issue[] = [];
  for (const issue of found) {
    if (!kept.some((k) => issue.start < k.end && issue.end > k.start)) kept.push(issue);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/** The character ranges of lines that are only an image marker. */
function markerRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    if (IMAGE_LINE.test(line)) ranges.push([offset, offset + line.length]);
    offset += line.length + 1;
  }
  return ranges;
}

/** `suggestion` with its first letter in the case of the matched text ("Mẹ cô" asks for "Mẹ em", not "mẹ em"). */
export function adaptCase(matched: string, suggestion: string): string {
  const first = matched.charAt(0);
  const capital = first !== '' && first !== first.toLowerCase() && first === first.toUpperCase();
  return capital && suggestion !== '' ? suggestion.charAt(0).toUpperCase() + suggestion.slice(1) : suggestion;
}

/** `text` with the hit replaced by `suggestion`; a capital first letter of the hit becomes a capital first letter. */
export function applySuggestion(text: string, issue: Issue, suggestion: string): string {
  const replacement = adaptCase(text.slice(issue.start, issue.end), suggestion);
  return text.slice(0, issue.start) + replacement + text.slice(issue.end);
}
