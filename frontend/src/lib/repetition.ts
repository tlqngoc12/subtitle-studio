/**
 * Repetition finders for the Check of original stories: phrases of 3 to 6 words that occur 3 or more times in a
 * chapter, and runs of 3 or more sentences that open with the same two words. Browser only, no Gemini.
 * Spec: docs/superpowers/specs/2026-11-23-writing-rules-design.md.
 */
import { foldWithMap } from './checkRules';

export const MIN_WORDS = 3;
export const MAX_WORDS = 6;
export const MIN_REPEATS = 3;
export const MIN_OPENING_RUN = 3;
export const OPENING_WORDS = 2;

/** Offsets in the original text. */
export interface Range {
  start: number;
  end: number;
}

export interface RepeatGroup {
  type: 'phrase' | 'opening';
  /** The phrase (or the two opening words) as written at its first occurrence. */
  label: string;
  ranges: Range[];
}

/** Words that carry no meaning alone; a phrase made only of these is never reported. */
export const STOP_WORDS: ReadonlySet<string> = new Set(
  ('của và là thì một cái những các đã đang sẽ không có này đó ấy với cho trong để được ở như khi mà nhưng cũng ' +
    'rằng lại vào').split(' '),
);

interface Token {
  word: string;
  /** Offsets in the original text. */
  start: number;
  end: number;
  /** Sentence number: a sentence end (`.?!…`, a line break, an image line) starts the next one. */
  segment: number;
}

const WORD = /[\p{L}\p{N}]+/gu;
const BREAK = /[.?!…\n\r]/u;
const IMAGE_LINE = /^\[\[image:\d+\]\]\s*$/;

function imageRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    if (IMAGE_LINE.test(line)) ranges.push([offset, offset + line.length]);
    offset += line.length + 1;
  }
  return ranges;
}

function tokenize(original: string): Token[] {
  const folded = foldWithMap(original);
  const text = folded.text;
  const skip = imageRanges(text);
  const tokens: Token[] = [];
  let segment = 0;
  let prevEnd = 0;
  for (const m of text.matchAll(WORD)) {
    const from = m.index as number;
    const to = from + m[0].length;
    if (skip.some(([a, b]) => from < b && to > a)) {
      segment += 1;
      prevEnd = to;
      continue;
    }
    if (BREAK.test(text.slice(prevEnd, from))) segment += 1;
    prevEnd = to;
    tokens.push({
      word: m[0],
      start: folded.origStart ? folded.origStart[from] : from,
      end: folded.origEnd ? folded.origEnd[to - 1] : to,
      segment,
    });
  }
  return tokens;
}

function wordsOf(phrase: string): string[] {
  return Array.from(foldWithMap(phrase).text.matchAll(WORD), (m) => m[0]);
}

const contains = (big: string, small: string) => ` ${big} `.includes(` ${small} `);

/** Phrases of 3 to 6 words seen 3 or more times, longest first within the same count; `ignore` phrases are never reported. */
export function findRepeatedPhrases(text: string, ignore: string[]): RepeatGroup[] {
  const tokens = tokenize(text);
  const seen = new Map<string, number[]>(); // folded phrase -> start token indexes
  for (let n = MIN_WORDS; n <= MAX_WORDS; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      if (tokens[i].segment !== tokens[i + n - 1].segment) continue;
      const words = tokens.slice(i, i + n).map((t) => t.word);
      if (words.every((w) => STOP_WORDS.has(w))) continue;
      const key = words.join(' ');
      const list = seen.get(key);
      if (list) list.push(i);
      else seen.set(key, [i]);
    }
  }
  interface Candidate {
    key: string;
    n: number;
    starts: number[];
  }
  const candidates: Candidate[] = [];
  for (const [key, starts] of seen) {
    const n = key.split(' ').length;
    const kept: number[] = [];
    for (const s of starts) {
      if (kept.length === 0 || s >= kept[kept.length - 1] + n) kept.push(s);
    }
    if (kept.length >= MIN_REPEATS) candidates.push({ key, n, starts: kept });
  }
  const maximal = candidates.filter(
    (c) => !candidates.some((o) => o !== c && o.n > c.n && o.starts.length === c.starts.length && contains(o.key, c.key)),
  );
  const ignored = ignore.map((p) => wordsOf(p).join(' ')).filter((p) => p !== '');
  return maximal
    .filter((c) => !ignored.some((p) => contains(c.key, p)))
    .map((c) => {
      const ranges = c.starts.map((s) => ({ start: tokens[s].start, end: tokens[s + c.n - 1].end }));
      return { type: 'phrase' as const, label: text.slice(ranges[0].start, ranges[0].end), ranges };
    })
    .sort((a, b) => a.ranges[0].start - b.ranges[0].start);
}

/** Runs of 3 or more consecutive sentences whose first two words match; one group per run. */
export function findRepeatedOpenings(text: string): RepeatGroup[] {
  const tokens = tokenize(text);
  const sentences: Token[][] = [];
  for (const t of tokens) {
    const last = sentences[sentences.length - 1];
    if (last && last[0].segment === t.segment) last.push(t);
    else sentences.push([t]);
  }
  const groups: RepeatGroup[] = [];
  let run: Token[][] = [];
  let runKey = '';
  const flush = () => {
    if (run.length >= MIN_OPENING_RUN) {
      const ranges = run.map((s) => ({ start: s[0].start, end: s[OPENING_WORDS - 1].end }));
      groups.push({ type: 'opening', label: text.slice(ranges[0].start, ranges[0].end), ranges });
    }
    run = [];
    runKey = '';
  };
  for (const s of sentences) {
    const key = s.length >= OPENING_WORDS ? s.slice(0, OPENING_WORDS).map((t) => t.word).join(' ') : '';
    if (key !== '' && key === runKey) {
      run.push(s);
      continue;
    }
    flush();
    if (key !== '') {
      run = [s];
      runKey = key;
    }
  }
  flush();
  return groups;
}
