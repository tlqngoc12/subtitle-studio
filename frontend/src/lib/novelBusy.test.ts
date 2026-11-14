import { describe, expect, it } from 'vitest';
import { chapterSummary, novelDetail } from '../test/novelFixtures';
import { busyLine, busyTitle, chapterBusy, novelBusy } from './novelBusy';

describe('novelBusy', () => {
  it('is null for an idle novel and for a FAILED notebook', () => {
    expect(novelBusy(novelDetail({ notebookStatus: 'IDLE', chapters: [] }))).toBeNull();
    expect(novelBusy(novelDetail({ notebookStatus: 'FAILED', chapters: [] }))).toBeNull();
  });

  it('names the translating chapter first', () => {
    const novel = novelDetail({
      notebookStatus: 'UPDATING',
      chapters: [chapterSummary({ id: 1, chapterNo: 25, translationStatus: 'TRANSLATING' })],
    });

    expect(novelBusy(novel)).toEqual({ reason: 'CHAPTER_TRANSLATING', chapterNo: 25 });
  });

  it('names the chapter the running update is for, not the latest published one', () => {
    const novel = novelDetail({
      notebookStatus: 'UPDATING',
      notebookChapterNo: 12,
      chapters: [
        chapterSummary({ id: 1, chapterNo: 7, publishStatus: 'PUBLISHED' }),
        chapterSummary({ id: 2, chapterNo: 24, publishStatus: 'PUBLISHED' }),
      ],
    });

    expect(novelBusy(novel)).toEqual({ reason: 'NOTEBOOK_UPDATING', chapterNo: 12 });
  });

  it('has no chapter number when the server sent none', () => {
    expect(novelBusy(novelDetail({ notebookStatus: 'UPDATING', notebookChapterNo: null, chapters: [] }))?.chapterNo).toBeNull();
  });
});

describe('chapterBusy', () => {
  const base = { translationStatus: 'TRANSLATED', chapterNo: 25, notebookStatus: 'IDLE' as const, notebookChapterNo: null };

  it('uses the notebook fields of the chapter detail', () => {
    expect(chapterBusy({ ...base, notebookStatus: 'UPDATING', notebookChapterNo: 24 })).toEqual({
      reason: 'NOTEBOOK_UPDATING',
      chapterNo: 24,
    });
    expect(chapterBusy({ ...base, notebookStatus: 'FAILED' })).toBeNull();
    expect(chapterBusy({ ...base, translationStatus: 'TRANSLATING' })?.reason).toBe('CHAPTER_TRANSLATING');
    expect(chapterBusy(base)).toBeNull();
  });
});

describe('texts', () => {
  it('words the title and the status line for each reason', () => {
    expect(busyTitle({ reason: 'CHAPTER_TRANSLATING', chapterNo: 25 })).toBe('Chapter 25 is still translating');
    expect(busyTitle({ reason: 'NOTEBOOK_UPDATING', chapterNo: 24 })).toBe('The notebook is still updating after chapter 24');
    expect(busyLine({ reason: 'CHAPTER_TRANSLATING', chapterNo: 25 })).toBe('Chapter 25 is translating…');
    expect(busyLine({ reason: 'NOTEBOOK_UPDATING', chapterNo: 24 })).toBe('Notebook updating after chapter 24…');
    expect(busyLine({ reason: 'NOTEBOOK_UPDATING', chapterNo: null })).toBe('Notebook updating…');
  });
});
