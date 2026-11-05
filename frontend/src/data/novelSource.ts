import type { PublicChapterFile, PublicNovelDetail, PublicNovelSummary } from './novelTypes';
import { readStaticJson } from './staticSource';

/** Read-only Novels data for the public site. Only the public site reads novels this way. */
export interface NovelSource {
  listNovels(): Promise<PublicNovelSummary[]>;
  getNovel(slug: string): Promise<PublicNovelDetail>;
  getChapter(slug: string, chapterNo: number): Promise<PublicChapterFile>;
}

export function createNovelSource(base = '/'): NovelSource {
  return {
    listNovels: () => readStaticJson<PublicNovelSummary[]>(base, 'novels.json'),
    getNovel: (slug) =>
      readStaticJson<PublicNovelDetail>(base, `novels/${encodeURIComponent(slug)}.json`, 'NOVEL_NOT_FOUND'),
    getChapter: (slug, chapterNo) =>
      readStaticJson<PublicChapterFile>(
        base,
        `novels/${encodeURIComponent(slug)}/${chapterNo}.json`,
        'CHAPTER_NOT_FOUND',
      ),
  };
}
