import * as Popover from '@radix-ui/react-popover';
import { Ellipsis, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PopoverPanel } from '../ui/PopoverPanel';
import '../profile/MemberMenu.css';
import './FanficMenu.css';

/** The admin `⋯` menu in the corner of a card (outside the link): Refresh from Wattpad and Delete. */
export function FanficMenu({
  title,
  busy,
  onRefresh,
  onDelete,
}: {
  title: string;
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
