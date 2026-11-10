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

/** Remembers each chapter's promise so prefetching and re-opening do not fetch twice; failures are not kept. */
export function withChapterCache(source: NovelSource): NovelSource {
  const cache = new Map<string, Promise<PublicChapterFile>>();
  return {
    ...source,
    getChapter: (slug, chapterNo) => {
      const key = `${slug}/${chapterNo}`;
      let p = cache.get(key);
      if (!p) {
        p = source.getChapter(slug, chapterNo);
        cache.set(key, p);
        p.catch(() => cache.delete(key));
      }
      return p;
    },
  };
}
