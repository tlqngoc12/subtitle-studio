import { describe, expect, it } from 'vitest';
import { diffBlocks } from './profileDiff';

const text = (b: { parts: { text: string }[] }) => b.parts.map((p) => p.text).join('');

describe('diffBlocks', () => {
  it('gives one unchanged block for equal texts', () => {
    expect(diffBlocks('a\nb\n', 'a\nb\n')).toEqual([{ kind: 'same', parts: [{ text: 'a\nb\n', changed: false }], lines: 2 }]);
  });

  it('marks pure additions and removals as whole blocks', () => {
    const blocks = diffBlocks('a\nc\n', 'a\nb\nc\n');
    expect(blocks.map((b) => b.kind)).toEqual(['same', 'added', 'same']);
    expect(text(blocks[1])).toBe('b\n');
    expect(blocks[1].lines).toBe(1);
    expect(blocks[1].parts.every((p) => !p.changed)).toBe(true);

    expect(diffBlocks('a\nb\n', 'a\n').map((b) => b.kind)).toEqual(['same', 'removed']);
  });

  it('pairs a replaced line and marks only the words that changed', () => {
    const blocks = diffBlocks('Emi gọi Bonnie là em.\n', 'Emi gọi Bonnie là chị.\n');
    expect(blocks.map((b) => b.kind)).toEqual(['removed', 'added']);
    expect(blocks[0].parts.filter((p) => p.changed).map((p) => p.text.trim())).toEqual(['em']);
    expect(blocks[1].parts.filter((p) => p.changed).map((p) => p.text.trim())).toEqual(['chị']);
    expect(text(blocks[0])).toBe('Emi gọi Bonnie là em.\n');
    expect(text(blocks[1])).toBe('Emi gọi Bonnie là chị.\n');
  });

  it('counts the lines of each block, also without a final newline', () => {
    const blocks = diffBlocks('one\ntwo\nthree', 'one\ntwo\nthree\nfour');
    expect(blocks.map((b) => [b.kind, b.lines])).toEqual([
      ['same', 2],
      ['removed', 1],
      ['added', 2],
    ]);
    expect(diffBlocks('a\nb\nc\nd\n', 'a\nb\nc\nd\ne\n').map((b) => [b.kind, b.lines])).toEqual([
      ['same', 4],
      ['added', 1],
    ]);
  });

  it('handles empty texts', () => {
    expect(diffBlocks('', '')).toEqual([]);
    expect(diffBlocks('', 'x\n').map((b) => b.kind)).toEqual(['added']);
  });
});
