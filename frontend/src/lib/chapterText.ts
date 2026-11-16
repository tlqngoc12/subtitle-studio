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

const IMAGE_MARKER = /^\[\[image:(\d+)]]$/;

/** The media id when the whole paragraph is an image marker line, `[[image:<id>]]`; otherwise null. */
export function imageMarkerId(paragraph: string): number | null {
  const m = IMAGE_MARKER.exec(paragraph.trim());
  return m ? Number(m[1]) : null;
}

/** The text without its image marker paragraphs; the blank lines they leave behind are collapsed. */
export function stripImageMarkers(text: string): string {
  return text
    .split(/\n\s*\n/)
    .filter((p) => imageMarkerId(p) === null)
    .join('\n\n')
    .trim();
}

/**
 * The index of the original's paragraph that goes with the translated paragraph `index`. Without image markers in the
 * original the two lists line up one to one, so the index is returned as it is. With markers, the markers are anchors:
 * a translated marker maps to the same marker of the original, and the paragraphs after it (up to the next marker) map
 * to the original's paragraphs after that marker. Paragraphs right after a marker that the original does not have
 * (the translation of the text inside the image) map to the marker itself. The result stays inside the original.
 */
export function alignParagraph(source: string[], translated: string[], index: number): number {
  const markerAt = source.map(imageMarkerId);
  if (source.length === 0 || markerAt.every((m) => m === null)) return index;
  const last = source.length - 1;
  const target = translated[index];
  if (target === undefined) return Math.min(Math.max(index, 0), last);

  const id = imageMarkerId(target);
  if (id !== null) {
    // The n-th translated marker with this id goes with the n-th source marker with this id.
    const nth = translated.slice(0, index).filter((p) => imageMarkerId(p) === id).length;
    const at = markerAt.map((m, i) => (m === id ? i : -1)).filter((i) => i >= 0)[nth];
    return at ?? Math.min(index, last);
  }

  // The translated segment holding the paragraph: from just after the previous marker to just before the next one.
  let from = index;
  while (from > 0 && imageMarkerId(translated[from - 1]) === null) from -= 1;
  let to = index;
  while (to < translated.length - 1 && imageMarkerId(translated[to + 1]) === null) to += 1;
  const offset = index - from;
  const length = to - from + 1;

  let sourceFrom = 0; // the original's first paragraph of the same segment
  let anchor: number | null = null; // the marker the segment follows
  if (from > 0) {
    const prevId = imageMarkerId(translated[from - 1]);
    const nth = translated.slice(0, from - 1).filter((p) => imageMarkerId(p) === prevId).length;
    anchor = markerAt.map((m, i) => (m === prevId ? i : -1)).filter((i) => i >= 0)[nth] ?? null;
    if (anchor === null) return Math.min(index, last);
    sourceFrom = anchor + 1;
  }
  let sourceTo = sourceFrom;
  while (sourceTo < source.length && markerAt[sourceTo] === null) sourceTo += 1;
  const sourceLength = sourceTo - sourceFrom;
  if (sourceLength === 0) return anchor ?? Math.min(sourceFrom, last);
  if (anchor !== null && length > sourceLength) {
    const extra = length - sourceLength; // the translation of the image's own text comes first
    return offset < extra ? anchor : sourceFrom + (offset - extra);
  }
  return sourceFrom + Math.min(offset, sourceLength - 1);
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
