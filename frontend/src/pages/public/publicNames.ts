import { useEffect } from 'react';
import type { NovelStatus } from '../../api/novels';
import { formatInstant } from '../../lib/dates';

/** Vietnamese names and copy shared by the public Novels pages (the admin UI stays English). */

/**
 * The chapter's name: its title ("Chương 3: Mưa", "Ngoại truyện I"). Files published before the label was merged into
 * the title may have no title (the old `label` is used) or neither ("Chương N").
 */
export function publicChapterTitle(c: { chapterNo: number; title?: string | null; label?: string | null }): string {
  return c.title?.trim() || c.label?.trim() || `Chương ${c.chapterNo}`;
}

/** The part of the title before its first colon ("Chương 3: Mưa" gives "Chương 3"); the reader bar has room for no more. */
export function publicChapterShortName(c: { chapterNo: number; title?: string | null; label?: string | null }): string {
  const title = publicChapterTitle(c);
  const colon = title.indexOf(':');
  return (colon < 0 ? title : title.slice(0, colon)).trim();
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

/** The site name: the pre-rendered pages end their `<title>` with it too (see PublicPageRenderer on the server). */
export const SITE_NAME = 'byZenQN';

/**
 * Sets `document.title` to "{title} · byZenQN" while the page is shown (ignored while `title` is null) and restores the
 * previous one. Matches the title the server pre-rendered into the page's HTML.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · ${SITE_NAME}`;
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
