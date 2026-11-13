import type { NovelStatus } from '../api/novels';
import { normalizeForSearch } from './search';

export type NovelSort = 'updated' | 'read' | 'added' | 'title';
export type NovelStatusFilter = 'all' | 'completed' | 'ongoing';

/** What the admin `NovelSummary` and the public `PublicNovelSummary` share, so one filter and sort serve both. */
export interface NovelListItem {
  title: string;
  slug: string;
  novelStatus: NovelStatus;
  updatedAt: string;
  lastPublishedAt?: string | null;
  createdAt?: string;
  originalAuthor?: string | null;
  tags?: string[];
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY);

/** Keeps the novels with this status whose title, author, tags or slug contain the query (accent-insensitive). */
export function filterNovels<T extends NovelListItem>(items: T[], query: string, status: NovelStatusFilter): T[] {
  const q = normalizeForSearch(query);
  return items.filter((n) => {
    if (status === 'completed' && n.novelStatus !== 'COMPLETED') return false;
    if (status === 'ongoing' && n.novelStatus !== 'ONGOING') return false;
    if (!q) return true;
    return [n.title, n.originalAuthor ?? '', (n.tags ?? []).join(' '), n.slug].some((text) =>
      normalizeForSearch(text).includes(q),
    );
  });
}

/**
 * A sorted copy. updated: `lastPublishedAt ?? updatedAt`, newest first; read: most reads first, unknown last;
 * added: `createdAt` newest first, missing last; title: A–Z in Vietnamese. Ties keep their given order.
 */
export function sortNovels<T extends NovelListItem>(
  items: T[],
  sort: NovelSort,
  reads: Record<string, number> | null,
): T[] {
  const compare: Record<NovelSort, (a: T, b: T) => number> = {
    updated: (a, b) => time(b.lastPublishedAt ?? b.updatedAt) - time(a.lastPublishedAt ?? a.updatedAt),
    read: (a, b) => (reads?.[b.slug] ?? -1) - (reads?.[a.slug] ?? -1),
    added: (a, b) => {
      const [x, y] = [time(a.createdAt), time(b.createdAt)];
      return x === y ? 0 : y > x ? 1 : -1;
    },
    title: (a, b) => a.title.localeCompare(b.title, 'vi'),
  };
  return [...items].sort(compare[sort]);
}
