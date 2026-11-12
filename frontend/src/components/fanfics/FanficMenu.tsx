import * as Popover from '@radix-ui/react-popover';
import { Ellipsis, Languages, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { PopoverPanel } from '../ui/PopoverPanel';
import '../profile/MemberMenu.css';
import './FanficMenu.css';

/**
 * The admin `⋯` menu in the corner of a card (outside the link): Translate this story (or Open translation when a
 * novel already uses the story), Refresh from Wattpad and Delete.
 */
export function FanficMenu({
  title,
  storyUrl,
  translationNovelId,
  busy,
  onRefresh,
  onDelete,
}: {
  title: string;
  /** The Wattpad story link; Translate this story opens New novel with it. */
  storyUrl: string;
  /** The id of the novel translated from this story, if there is one. */
  translationNovelId?: number | null;
  busy?: boolean;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <div className="fanfic-menu">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="button button--icon button--s"
            aria-label={`Menu for ${title}`}
            aria-busy={busy || undefined}
          >
            <Ellipsis className="icon" aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <PopoverPanel className="member-menu">
          <div className="member-menu__list">
            {translationNovelId != null ? (
              <Link className="member-menu__item" to={`/novels/${translationNovelId}`} onClick={() => setOpen(false)}>
                <Languages className="icon" aria-hidden="true" />
                Open translation
              </Link>
            ) : (
              <Link className="member-menu__item" to={`/novels/new?wattpad=${encodeURIComponent(storyUrl)}`}
                onClick={() => setOpen(false)}>
                <Languages className="icon" aria-hidden="true" />
                Translate this story
              </Link>
            )}
            <button type="button" className="member-menu__item" disabled={busy} onClick={run(onRefresh)}>
              <RefreshCw className="icon" aria-hidden="true" />
              Refresh
            </button>
            <button type="button" className="member-menu__item member-menu__item--danger" onClick={run(onDelete)}>
              <Trash2 className="icon" aria-hidden="true" />
              Delete
            </button>
          </div>
        </PopoverPanel>
      </Popover.Root>
    </div>
  );
}
