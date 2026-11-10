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
  /** Every chapter of the novel, drafts included (the y of "x/y chương"). Missing in files published earlier. */
  totalChapters?: number;
  /** When the latest published chapter went out; null or missing without one. Falls back to `updatedAt`. */
  lastPublishedAt?: string | null;
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
  /** YouTube video id of the trailer; null or missing without one (and in files published before trailers). */
  trailerVideoId?: string | null;
  chapters: PublicChapterRef[];
}

/** One rendering of a chapter's pages at a given size. */
export interface PublicPageFormat {
  key: 's' | 'm' | 'l';
  width: number;
  height: number;
  images: string[];
}

/** A chapter as drawn images; there is no text in it. */
export interface PublicChapterFile {
  chapterNo: number;
  title: string | null;
  label?: string | null;
  prev: number | null;
  next: number | null;
  images: string[];
  /** Missing in files published before formats. */
  formats?: PublicPageFormat[];
}
