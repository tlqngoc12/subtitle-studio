export const PAGE_SIZE = 10;

export interface Page<T> {
  /** 1-based, clamped to [1, pageCount]. */
  page: number;
  /** At least 1, even for an empty list. */
  pageCount: number;
  items: T[];
}

/** The slice of `items` shown on `page`; a page out of range shows the nearest valid one. */
export function paginate<T>(items: T[], page: number, size = PAGE_SIZE): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  return { page: current, pageCount, items: items.slice((current - 1) * size, current * size) };
}

/** Reads `?page=` as a positive integer; anything else means page 1. */
export function parsePage(raw: string | null): number {
  return raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : 1;
}
