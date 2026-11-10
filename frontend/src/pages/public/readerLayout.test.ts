import { describe, expect, it } from 'vitest';
import type { PublicChapterFile } from '../../data/novelTypes';
import { READER_COLUMNS, pickFormat } from './readerLayout';

const base: PublicChapterFile = { chapterNo: 1, title: null, prev: null, next: null, images: ['a.webp'] };
const withFormats: PublicChapterFile = {
  ...base,
  formats: [
    { key: 's', width: 1080, height: 1600, images: ['s.webp'] },
    { key: 'm', width: 820, height: 1215, images: ['m.webp'] },
    { key: 'l', width: 640, height: 948, images: ['l.webp'] },
  ],
};

describe('pickFormat', () => {
  it('has three desktop columns', () => {
    expect(READER_COLUMNS).toEqual([560, 640, 720]);
  });

  it('falls back to images as format s when formats is missing', () => {
    expect(pickFormat(base, true, 2)).toEqual({ key: 's', width: 1080, height: 1600, images: ['a.webp'] });
  });

  it('compact size 2 picks l', () => {
    expect(pickFormat(withFormats, true, 2).key).toBe('l');
    expect(pickFormat(withFormats, true, 1).key).toBe('m');
    expect(pickFormat(withFormats, true, 0).key).toBe('s');
  });

  it('desktop always picks s', () => {
    expect(pickFormat(withFormats, false, 2).key).toBe('s');
  });

  it('missing m falls back to s', () => {
    const noM = { ...withFormats, formats: withFormats.formats!.filter((f) => f.key !== 'm') };
    expect(pickFormat(noM, true, 1).key).toBe('s');
  });
});
