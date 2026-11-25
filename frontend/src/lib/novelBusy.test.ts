import { describe, expect, it } from 'vitest';
import { chapterSummary, novelDetail } from '../test/novelFixtures';
import { busyLine, busyTitle, chapterBusy, novelBusy } from './novelBusy';

describe('novelBusy', () => {
  it('is null for an idle novel', () => {
    expect(novelBusy(novelDetail({ chapters: [] }))).toBeNull();
  });

  it('names the translating chapter first', () => {
    const novel = novelDetail({
      chapters: [chapterSummary({ id: 1, chapterNo: 25, title: 'Chương 25: Mưa', translationStatus: 'TRANSLATING' })],
    });

    expect(novelBusy(novel)).toEqual({ reason: 'CHAPTER_TRANSLATING', chapterTitle: 'Chương 25: Mưa' });
  });

});

describe('chapterBusy', () => {
  const base = { translationStatus: 'TRANSLATED', title: 'Chương 25: Mưa' };

  it('is busy only while the chapter itself translates', () => {
    expect(chapterBusy({ ...base, translationStatus: 'TRANSLATING' })?.reason).toBe('CHAPTER_TRANSLATING');
    expect(chapterBusy(base)).toBeNull();
  });
});

describe('texts', () => {
  it('words the title and the status line', () => {
    expect(busyTitle({ reason: 'CHAPTER_TRANSLATING', chapterTitle: 'Chương 25: Mưa' })).toBe(
      'Chương 25: Mưa is still translating',
    );
    expect(busyLine({ reason: 'CHAPTER_TRANSLATING', chapterTitle: 'Chương 25: Mưa' })).toBe(
      'Chương 25: Mưa is translating…',
    );
    expect(busyTitle({ reason: 'CHAPTER_TRANSLATING', chapterTitle: null })).toBe('A chapter is still translating');
    expect(busyLine({ reason: 'CHAPTER_TRANSLATING', chapterTitle: null })).toBe('A chapter is translating…');
  });
});
