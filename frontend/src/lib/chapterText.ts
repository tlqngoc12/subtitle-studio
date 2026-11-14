/** Chapter text helpers: counts, the paragraph under the caret, and literal search. */

/** Paragraphs are separated by a blank line; each is trimmed and empty ones are dropped (same rule as the backend). */
export function paragraphs(text: string): string[] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function countText(text: string): { words: number; characters: number; paragraphs: number } {
  const trimmed = text.trim();
  return {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    characters: text.length,
    paragraphs: paragraphs(text).length,
  };
}

/**
 * The 0-based index of the paragraph that holds the caret. The end of a paragraph still belongs to it; a caret inside
 * the blank line after it belongs to the next one. Past the last paragraph it stays on the last.
 */
export function paragraphIndexAt(text: string, caret: number): number {
  const count = paragraphs(text).length;
  if (count === 0) return 0;
  const lead = text.length - text.trimStart().length;
  let index = 0;
  for (const m of text.matchAll(/\n\s*\n/g)) {
    const start = m.index ?? 0;
    if (start < lead) continue;
    if (start >= caret) break;
    index += 1;
  }
  return Math.min(index, count - 1);
}

/** Literal, non-overlapping matches. An empty query matches nothing. */
export function findMatches(text: string, query: string, matchCase: boolean): { start: number; end: number }[] {
  if (!query) return [];
  const haystack = matchCase ? text : text.toLowerCase();
  const needle = matchCase ? query : query.toLowerCase();
  const found: { start: number; end: number }[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    found.push({ start: at, end: at + needle.length });
    from = at + needle.length;
  }
  return found;
}
