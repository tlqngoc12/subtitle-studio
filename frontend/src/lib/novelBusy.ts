import type { NovelDetail } from '../api/novels';

/** Why a novel cannot start another translation now: one Gemini job per novel at a time. */
export type NovelBusy = { reason: 'CHAPTER_TRANSLATING'; chapterNo: number | null };

/** The chapter that is translating, else null. */
export function novelBusy(novel: Pick<NovelDetail, 'chapters'>): NovelBusy | null {
  const translating = novel.chapters.find((c) => c.translationStatus === 'TRANSLATING');
  if (translating) return { reason: 'CHAPTER_TRANSLATING', chapterNo: translating.chapterNo };
  return null;
}

/** On the chapter page only the chapter's own fields are known: whether it is translating. */
export function chapterBusy(chapter: { translationStatus: string; chapterNo: number }): NovelBusy | null {
  if (chapter.translationStatus === 'TRANSLATING') return { reason: 'CHAPTER_TRANSLATING', chapterNo: chapter.chapterNo };
  return null;
}

/** The tooltip and error title: "Chapter 25 is still translating". */
export function busyTitle(busy: NovelBusy): string {
  return busy.chapterNo === null ? 'A chapter is still translating' : `Chapter ${busy.chapterNo} is still translating`;
}

/** The muted status line: "Chapter 25 is translating…". */
export function busyLine(busy: NovelBusy): string {
  return busy.chapterNo === null ? 'A chapter is translating…' : `Chapter ${busy.chapterNo} is translating…`;
}
