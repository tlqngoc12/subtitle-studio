import type { NotebookStatus, NovelDetail } from '../api/novels';

/** Why a novel cannot start another translation now: one Gemini job per novel at a time. */
export type NovelBusy = { reason: 'CHAPTER_TRANSLATING' | 'NOTEBOOK_UPDATING'; chapterNo: number | null };

/** The chapter that is translating, else the notebook update (the chapter it is for), else null. A FAILED notebook is not busy. */
export function novelBusy(novel: Pick<NovelDetail, 'notebookStatus' | 'chapters' | 'notebookChapterNo'>): NovelBusy | null {
  const translating = novel.chapters.find((c) => c.translationStatus === 'TRANSLATING');
  if (translating) return { reason: 'CHAPTER_TRANSLATING', chapterNo: translating.chapterNo };
  if (novel.notebookStatus === 'UPDATING') return { reason: 'NOTEBOOK_UPDATING', chapterNo: novel.notebookChapterNo ?? null };
  return null;
}

/** On the chapter page only the chapter's own fields are known: the notebook state and the chapter it is updating after. */
export function chapterBusy(chapter: {
  translationStatus: string;
  chapterNo: number;
  notebookStatus: NotebookStatus;
  notebookChapterNo: number | null;
}): NovelBusy | null {
  if (chapter.translationStatus === 'TRANSLATING') return { reason: 'CHAPTER_TRANSLATING', chapterNo: chapter.chapterNo };
  if (chapter.notebookStatus === 'UPDATING') return { reason: 'NOTEBOOK_UPDATING', chapterNo: chapter.notebookChapterNo };
  return null;
}

/** The tooltip and error title: "Chapter 25 is still translating" / "The notebook is still updating after chapter 24". */
export function busyTitle(busy: NovelBusy): string {
  if (busy.reason === 'CHAPTER_TRANSLATING') {
    return busy.chapterNo === null ? 'A chapter is still translating' : `Chapter ${busy.chapterNo} is still translating`;
  }
  return busy.chapterNo === null
    ? 'The notebook is still updating'
    : `The notebook is still updating after chapter ${busy.chapterNo}`;
}

/** The muted status line: "Chapter 25 is translating…" / "Notebook updating after chapter 24…". */
export function busyLine(busy: NovelBusy): string {
  if (busy.reason === 'CHAPTER_TRANSLATING') {
    return busy.chapterNo === null ? 'A chapter is translating…' : `Chapter ${busy.chapterNo} is translating…`;
  }
  return busy.chapterNo === null ? 'Notebook updating…' : `Notebook updating after chapter ${busy.chapterNo}…`;
}
