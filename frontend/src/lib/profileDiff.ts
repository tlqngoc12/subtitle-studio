import { diffLines, diffWordsWithSpace } from 'diff';

/** A run of text inside a block; `changed` marks the words that differ from the paired block. */
export interface DiffPart {
  text: string;
  changed: boolean;
}

/** Consecutive lines that are unchanged, added, or removed. */
export interface DiffBlock {
  kind: 'same' | 'added' | 'removed';
  parts: DiffPart[];
  /** Number of lines in the block. */
  lines: number;
}

function lineCount(text: string): number {
  if (text === '') return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

function block(kind: DiffBlock['kind'], parts: DiffPart[]): DiffBlock {
  return { kind, parts, lines: lineCount(parts.map((p) => p.text).join('')) };
}

/**
 * Line diff of two texts (jsdiff). A removed block directly followed by an added one is a replacement, so the
 * two are also compared word by word and only the words that changed are marked `changed`.
 */
export function diffBlocks(before: string, after: string): DiffBlock[] {
  const changes = diffLines(before, after);
  const out: DiffBlock[] = [];
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const next = changes[i + 1];
    if (change.removed && next?.added) {
      const words = diffWordsWithSpace(change.value, next.value);
      out.push(
        block('removed', words.filter((w) => !w.added).map((w) => ({ text: w.value, changed: Boolean(w.removed) }))),
        block('added', words.filter((w) => !w.removed).map((w) => ({ text: w.value, changed: Boolean(w.added) }))),
      );
      i++;
    } else if (change.removed) {
      out.push(block('removed', [{ text: change.value, changed: false }]));
    } else if (change.added) {
      out.push(block('added', [{ text: change.value, changed: false }]));
    } else {
      out.push(block('same', [{ text: change.value, changed: false }]));
    }
  }
  return out;
}

/** True when the two texts have no difference. */
export function isUnchanged(before: string, after: string): boolean {
  return before === after;
}
