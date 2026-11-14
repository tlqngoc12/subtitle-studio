import { useEffect } from 'react';
import type { NovelStatus } from '../../api/novels';
import { formatInstant } from '../../lib/dates';

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

/**
 * The chapter count a reader sees: published chapters only. The total added to the app (drafts included) is not the
 * original's length, so "7/8" would mislead.
 */
export function publicChapterCount(n: { publishedCount: number }): string {
  return String(n.publishedCount);
}

/** When a novel last got a chapter: the latest published chapter, else the novel's own update time. */
export function latestUpdate(n: { lastPublishedAt?: string | null; updatedAt: string }): string {
  return n.lastPublishedAt ?? n.updatedAt;
}

/** Newest first by {@link latestUpdate}. */
export function byLatestUpdate<T extends { lastPublishedAt?: string | null; updatedAt: string }>(novels: T[]): T[] {
  return [...novels].sort((a, b) => Date.parse(latestUpdate(b)) - Date.parse(latestUpdate(a)));
}

/** "vừa xong", "5 phút trước", "3 giờ trước", "2 ngày trước"; from 30 days on the plain date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const sec = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 1000));
  if (sec < 60) return 'vừa xong';
  if (sec < 3600) return `${Math.floor(sec / 60)} phút trước`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} giờ trước`;
  if (sec < 30 * 86400) return `${Math.floor(sec / 86400)} ngày trước`;
  return formatInstant(iso);
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

/** At most this many novels are on the public banner. */
export const BANNER_LIMIT = 5;

/**
 * The novels the banner shows: the ones picked by hand (`featured`), newest update first, at most five. When none is
 * picked (or the published file predates the flag, or the picked ones have no published chapter), the five most
 * recently updated novels, so the banner is never empty.
 */
export function bannerNovels<T extends { featured?: boolean; lastPublishedAt?: string | null; updatedAt: string }>(
  novels: T[],
): T[] {
  const picked = novels.filter((n) => n.featured);
  return byLatestUpdate(picked.length > 0 ? picked : novels).slice(0, BANNER_LIMIT);
}
