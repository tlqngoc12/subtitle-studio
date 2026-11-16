import { describe, expect, it } from 'vitest';
import { chapterSummary, novelDetail } from '../test/novelFixtures';
import { busyLine, busyTitle, chapterBusy, novelBusy } from './novelBusy';

describe('novelBusy', () => {
  it('is null for an idle novel', () => {
    expect(novelBusy(novelDetail({ chapters: [] }))).toBeNull();
  });

  it('names the translating chapter first', () => {
    const novel = novelDetail({
      chapters: [chapterSummary({ id: 1, chapterNo: 25, translationStatus: 'TRANSLATING' })],
    });

    expect(novelBusy(novel)).toEqual({ reason: 'CHAPTER_TRANSLATING', chapterNo: 25 });
  });

});

describe('chapterBusy', () => {
  const base = { translationStatus: 'TRANSLATED', chapterNo: 25 };

  it('is busy only while the chapter itself translates', () => {
    expect(chapterBusy({ ...base, translationStatus: 'TRANSLATING' })?.reason).toBe('CHAPTER_TRANSLATING');
    expect(chapterBusy(base)).toBeNull();
  });
});

describe('texts', () => {
  it('words the title and the status line', () => {
    expect(busyTitle({ reason: 'CHAPTER_TRANSLATING', chapterNo: 25 })).toBe('Chapter 25 is still translating');
    expect(busyLine({ reason: 'CHAPTER_TRANSLATING', chapterNo: 25 })).toBe('Chapter 25 is translating…');
  });
});
