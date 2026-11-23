import * as Popover from '@radix-ui/react-popover';
import { List, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { getNovel, type ChapterSummary } from '../../api/novels';
import { normalizeForSearch } from '../../lib/search';
import { Tip } from '../Tip';
import { chapterLabel } from '../novel/ChapterList';
import { StatusBadges } from '../novel/StatusBadges';
import { Skeleton } from '../ui/Skeleton';
import { PopoverPanel } from '../ui/PopoverPanel';
import './ChapterJump.css';

/** The chapters that match the query: the exact chapter number first, then names that contain it; reading order inside each group. */
export function filterChapters(chapters: ChapterSummary[], query: string): ChapterSummary[] {
  const q = normalizeForSearch(query);
  if (!q) return chapters;
  const exact = chapters.filter((c) => String(c.chapterNo) === q);
  const named = chapters.filter(
    (c) => String(c.chapterNo) !== q && normalizeForSearch(chapterLabel(c.chapterNo, c.title, c.label)).includes(q),
  );
  return [...exact, ...named];
}

/**
 * `☰ 3 / 42` between Previous and Next: a popover with every chapter of the novel and a search box. The list is
 * fetched the first time the popover opens and kept while the page stays. Choosing a row goes through `onLeave`, so
 * unsaved edits still ask first.
 */
export function ChapterJump({
  novelId,
  currentId,
  position,
  total,
  original,
  chapterPath,
  onLeave,
}: {
  novelId: number;
  currentId: number;
  position: number;
  total: number;
  /** An original story: nothing is translated, so rows show no translation icon. */
  original: boolean;
  chapterPath: (id: number) => string;
  onLeave: (e: MouseEvent<HTMLAnchorElement>, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [chapters, setChapters] = useState<ChapterSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const loading = useRef(false);
  const list = useRef<HTMLUListElement>(null);

  async function load() {
    if (loading.current) return;
    loading.current = true;
    setFailed(false);
    try {
      setChapters((await getNovel(novelId)).chapters);
    } catch {
      setFailed(true);
    } finally {
      loading.current = false;
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery('');
      if (chapters === null) void load();
    }
  }

  const shown = useMemo(() => filterChapters(chapters ?? [], query), [chapters, query]);

  // The row the keyboard is on: the current chapter when nothing is typed, else the first match.
  useEffect(() => {
    const at = query ? 0 : shown.findIndex((c) => c.id === currentId);
    setActive(Math.max(at, 0));
  }, [shown, query, currentId, open]);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, shown]);

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (shown.length === 0) return;
      setActive((a) => (e.key === 'ArrowDown' ? Math.min(a + 1, shown.length - 1) : Math.max(a - 1, 0)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      (list.current?.querySelector('[data-active="true"]') as HTMLElement | null)?.click();
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Tip label="All chapters">
        <Popover.Trigger asChild>
          <button type="button" className="button chapter-jump__button">
            <List className="icon" aria-hidden="true" />
            <span className="visually-hidden">All chapters, </span>
            {position} / {total}
          </button>
        </Popover.Trigger>
      </Tip>
      <PopoverPanel
        align="start"
        className="chapter-jump"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).querySelector('input')?.focus();
        }}
      >
        <label className="chapter-jump__search">
          <Search className="icon icon--sm" aria-hidden="true" />
          <input
            type="search"
            className="chapter-jump__input"
            placeholder="Find a chapter…"
            aria-label="Find a chapter"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </label>
        {failed ? (
          <div className="chapter-jump__state" role="alert">
            <p>Couldn't load chapters.</p>
            <button type="button" className="button button--s" onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : chapters === null ? (
          <div className="chapter-jump__state" role="status" aria-label="Loading chapters">
            <Skeleton height="1.5rem" />
            <Skeleton height="1.5rem" />
            <Skeleton height="1.5rem" />
          </div>
        ) : shown.length === 0 ? (
          <p className="chapter-jump__state">No chapters match.</p>
        ) : (
          <ul className="chapter-jump__list" ref={list} aria-label="Chapters">
            {shown.map((c, i) => {
              const name = chapterLabel(c.chapterNo, c.title, c.label);
              const to = chapterPath(c.id);
              return (
                <li key={c.id}>
                  <Link
                    to={to}
                    className="chapter-jump__row"
                    aria-current={c.id === currentId ? 'page' : undefined}
                    data-active={i === active}
                    title={name}
                    onClick={(e) => {
                      setOpen(false);
                      onLeave(e, to);
                    }}
                  >
                    <span className="chapter-jump__name">{name}</span>
                    <StatusBadges
                      compact
                      translation={original ? undefined : c.translationStatus}
                      publish={c.publishStatus}
                      model={c.translationModel}
                      fallback={c.translatedByFallback}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverPanel>
    </Popover.Root>
  );
}
