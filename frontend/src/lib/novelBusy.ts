import type { NovelDetail } from '../api/novels';

/** Why a novel cannot start another translation now: one Gemini job per novel at a time. */
export type NovelBusy = { reason: 'CHAPTER_TRANSLATING'; chapterTitle: string | null };

/** The chapter that is translating, else null. */
export function novelBusy(novel: Pick<NovelDetail, 'chapters'>): NovelBusy | null {
  const translating = novel.chapters.find((c) => c.translationStatus === 'TRANSLATING');
  if (translating) return { reason: 'CHAPTER_TRANSLATING', chapterTitle: translating.title };
  return null;
}

/** On the chapter page only the chapter's own fields are known: whether it is translating. */
export function chapterBusy(chapter: { translationStatus: string; title: string }): NovelBusy | null {
  if (chapter.translationStatus === 'TRANSLATING') return { reason: 'CHAPTER_TRANSLATING', chapterTitle: chapter.title };
  return null;
}

/** The tooltip and error title: "Chương 25: Mưa is still translating". */
export function busyTitle(busy: NovelBusy): string {
  return busy.chapterTitle === null ? 'A chapter is still translating' : `${busy.chapterTitle} is still translating`;
}

/** The muted status line: "Chương 25: Mưa is translating…". */
export function busyLine(busy: NovelBusy): string {
  return busy.chapterTitle === null ? 'A chapter is translating…' : `${busy.chapterTitle} is translating…`;
}
