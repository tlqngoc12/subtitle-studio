import type { NovelStatus } from '../api/novels';

/** Public Novels data written by Publish (backend records PublicNovelSummary / PublicNovelDetail / PublicChapterFile). */

export interface PublicNovelSummary {
  slug: string;
  title: string;
  coverUrl: string | null;
  originalAuthor: string | null;
  tags: string[];
  novelStatus: NovelStatus;
  publishedCount: number;
  updatedAt: string;
}

export interface PublicChapterRef {
  chapterNo: number;
  title: string | null;
  /** Missing in files published before labels existed. */
  label?: string | null;
}

export interface PublicNovelDetail {
  slug: string;
  title: string;
  coverUrl: string | null;
  originalAuthor: string | null;
  description: string | null;
  tags: string[];
  novelStatus: NovelStatus;
  translatorCredit: string | null;
  sourceUrl: string | null;
  chapters: PublicChapterRef[];
}

/** A chapter as drawn images; there is no text in it. */
export interface PublicChapterFile {
  chapterNo: number;
  title: string | null;
  label?: string | null;
  prev: number | null;
  next: number | null;
  images: string[];
}
