import { ChevronLeft, ChevronRight, CloudDownload } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { ChapterDetail } from '../../api/novels';
import { busyTitle, type NovelBusy } from '../../lib/novelBusy';
import { Tip } from '../Tip';
import { IconLink } from '../ui/IconButton';

interface Props {
  chapter: ChapterDetail;
  chapterPath: (id: number) => string;
  /** In-app links ask first when there are unsaved edits. */
  onLeave: (e: MouseEvent<HTMLAnchorElement>, to: string) => void;
  /** Why no translation can start now (null = it can). */
  why: NovelBusy | null;
  locked: boolean;
  starting: boolean;
  onStartNext: () => void;
}

/** Previous / next chapter, and "Fetch & translate next" on the last chapter of a Wattpad novel. */
export function ChapterNav({ chapter, chapterPath, onLeave, why, locked, starting, onStartNext }: Props) {
  return (
    <>
      {chapter.prevChapterId !== null && (
        <IconLink label="Previous chapter" icon={ChevronLeft} to={chapterPath(chapter.prevChapterId)}
          onClick={(e) => onLeave(e, chapterPath(chapter.prevChapterId!))} />
      )}
      {chapter.nextChapterId !== null && (
        <IconLink label="Next chapter" icon={ChevronRight} to={chapterPath(chapter.nextChapterId)}
          onClick={(e) => onLeave(e, chapterPath(chapter.nextChapterId!))} />
      )}
      {/* The last chapter of a Wattpad novel: start the next part from here instead of the Wattpad tab. */}
      {chapter.wattpadPartId !== null && chapter.nextChapterId === null && (
        <Tip label={why ? busyTitle(why) : ''} disabled={!why}>
          <span className="chapter-head__next">
            <button className="button" type="button" disabled={locked || starting || why !== null}
              onClick={onStartNext}>
              <CloudDownload className="icon" aria-hidden="true" />
              {starting ? 'Starting…' : 'Fetch & translate next'}
            </button>
          </span>
        </Tip>
      )}
    </>
  );
}
