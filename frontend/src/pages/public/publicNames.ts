import { useEffect } from 'react';
import type { NovelStatus } from '../../api/novels';

/** Vietnamese names and copy shared by the public Novels pages (the admin UI stays English). */

/** The chapter's label ("Ngoại truyện 1"), or "Chương N". */
export function publicChapterName(chapterNo: number, label?: string | null): string {
  return label?.trim() ? label.trim() : `Chương ${chapterNo}`;
}

/** The name with the title: "Chương 3: Mưa", "Ngoại truyện 1: Ngày cưới". */
export function publicChapterLabel(chapterNo: number, title: string | null, label?: string | null): string {
  const name = publicChapterName(chapterNo, label);
  return title ? `${name}: ${title}` : name;
}

export const PUBLIC_STATUS_LABEL: Record<NovelStatus, string> = { ONGOING: 'Đang ra', COMPLETED: 'Hoàn thành' };

export function publicChapterCount(count: number): string {
  return `${count} chương`;
}

/** The "x/y" of a novel: published chapters over all chapters (older files without the total show x/x). */
export function publicChapterProgress(n: { publishedCount: number; totalChapters?: number }): string {
  return `${n.publishedCount}/${n.totalChapters ?? n.publishedCount}`;
}

/** When a novel last got a chapter: the latest published chapter, else the novel's own update time. */
export function latestUpdate(n: { lastPublishedAt?: string | null; updatedAt: string }): string {
  return n.lastPublishedAt ?? n.updatedAt;
}

/** Newest first by {@link latestUpdate}. */
export function byLatestUpdate<T extends { lastPublishedAt?: string | null; updatedAt: string }>(novels: T[]): T[] {
  return [...novels].sort((a, b) => Date.parse(latestUpdate(b)) - Date.parse(latestUpdate(a)));
}

const VIETNAM_DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** `dd/MM/yyyy` in Vietnam time (the site's readers). */
export function publicDate(iso: string): string {
  return VIETNAM_DATE.format(new Date(iso));
}

/** "vừa xong", "5 phút trước", "3 giờ trước", "2 ngày trước"; from 30 days on the plain date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const sec = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 1000));
  if (sec < 60) return 'vừa xong';
  if (sec < 3600) return `${Math.floor(sec / 60)} phút trước`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} giờ trước`;
  if (sec < 30 * 86400) return `${Math.floor(sec / 86400)} ngày trước`;
  return publicDate(iso);
}

/** What guests see for any load error, whatever the cause. */
export const PUBLIC_ERROR_TITLE = 'Không tải được. Vui lòng thử lại sau.';

/** Sets `document.title` while the page is shown (ignored while `title` is null) and restores the previous one. */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
