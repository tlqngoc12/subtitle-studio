import * as Popover from '@radix-ui/react-popover';
import { List } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { getNovel, type ChapterSummary } from '../../api/novels';
import { chapterLabel } from '../novel/ChapterList';
import { StatusBadges } from '../novel/StatusBadges';
import { IconButton } from '../ui/IconButton';
import { PopoverPanel } from '../ui/PopoverPanel';
import { Skeleton } from '../ui/Skeleton';
import '../../styles/chapter-toc.css';
import './ChapterJump.css';

/**
 * A list icon between Previous and Next: a popover with every chapter of the novel, the one being edited marked.
 * The list is fetched the first time the popover opens and kept while the page stays. Rows are plain links (Tab moves
 * through them, Esc closes); choosing one goes through `onLeave`, so unsaved edits still ask first.
 */
export function ChapterJump({
  novelId,
  currentId,
  original,
  chapterPath,
  onLeave,
}: {
  novelId: number;
  currentId: number;
  /** An original story: nothing is translated, so rows show no translation icon. */
  original: boolean;
  chapterPath: (id: number) => string;
  onLeave: (e: MouseEvent<HTMLAnchorElement>, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [chapters, setChapters] = useState<ChapterSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const loading = useRef(false);
  const currentLink = useRef<HTMLAnchorElement>(null);

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
    if (next && chapters === null) void load();
  }

  // Once the rows are there, land on the current chapter's link and bring it to the middle of the list.
  useEffect(() => {
    if (!open || chapters === null) return;
    currentLink.current?.focus();
    currentLink.current?.scrollIntoView?.({ block: 'center' });
  }, [open, chapters]);

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <IconButton label="All chapters" icon={List} />
      </Popover.Trigger>
      <PopoverPanel align="start" className="chapter-jump">
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
        ) : (
          <ul className="chapter-toc__list chapter-jump__list" aria-label="Chapters">
            {chapters.map((c) => {
              const name = chapterLabel(c.chapterNo, c.title, c.label);
              const to = chapterPath(c.id);
              const current = c.id === currentId;
              return (
                <li key={c.id} className={current ? 'chapter-toc__item chapter-toc__item--current' : 'chapter-toc__item'}>
                  <Link
                    ref={current ? currentLink : undefined}
                    to={to}
                    className="chapter-toc__link"
                    aria-current={current ? 'page' : undefined}
                    title={name}
                    onClick={(e) => {
                      setOpen(false);
                      onLeave(e, to);
                    }}
                  >
                    <span className="chapter-toc__name">{name}</span>
                    <StatusBadges
                      compact
                      interactive={false}
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
