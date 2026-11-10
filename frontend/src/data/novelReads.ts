import { useEffect, useState } from 'react';

/** Per-novel read totals, kept by a Cloudflare Pages Function + D1 (generated at Publish). Every failure is silent. */

const DEDUP_MS = 24 * 60 * 60 * 1000;
const CACHE_MS = 60 * 1000;

export type ReadCounts = Record<string, number>;

/**
 * Counts one opening of a chapter, at most once per browser per chapter every 24 h (localStorage). Fire-and-forget:
 * a blocked storage or a network error is ignored.
 */
export function recordRead(slug: string, chapterNo: number, now: number = Date.now()): void {
  const key = `reads:${slug}:${chapterNo}`;
  try {
    const last = Number(localStorage.getItem(key));
    if (last > 0 && now - last < DEDUP_MS) return;
  } catch {
    // Storage is blocked: count anyway.
  }
  try {
    void fetch(`/api/reads/${encodeURIComponent(slug)}`, { method: 'POST', keepalive: true }).then(
      (res) => {
        if (!res.ok) return;
        try {
          localStorage.setItem(key, String(now));
        } catch {
          // not remembered
        }
      },
      () => {},
    );
  } catch {
    // fetch unavailable
  }
}

let cached: { at: number; promise: Promise<ReadCounts | null> } | null = null;

/** `{ slug: reads }` for every published novel, or null when the counts are unavailable. Cached for a minute. */
export function fetchReadCounts(): Promise<ReadCounts | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.promise;
  const promise = (async () => {
    try {
      const res = await fetch('/api/reads');
      if (!res.ok || !(res.headers.get('Content-Type') ?? '').includes('json')) return null;
      const body: unknown = await res.json();
      return body && typeof body === 'object' && !Array.isArray(body) ? (body as ReadCounts) : null;
    } catch {
      return null;
    }
  })();
  cached = { at: Date.now(), promise };
  void promise.then((value) => {
    if (value === null && cached?.promise === promise) cached = null; // let a later visit try again
  });
  return promise;
}

/** Test hook: forget the cached counts. */
export function resetReadCounts(): void {
  cached = null;
}

/** The counts for the page, or null while loading or when unavailable (the display is then hidden). */
export function useReadCounts(): ReadCounts | null {
  const [counts, setCounts] = useState<ReadCounts | null>(null);
  useEffect(() => {
    let live = true;
    void fetchReadCounts().then((c) => live && setCounts(c));
    return () => {
      live = false;
    };
  }, []);
  return counts;
}

const COMPACT = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });

/** 999 -> "999", 1234 -> "1,2 N", 1 200 000 -> "1,2 Tr". */
export function formatReads(n: number): string {
  return n < 1000 ? String(n) : COMPACT.format(n);
}
