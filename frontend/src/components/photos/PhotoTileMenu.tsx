import * as Popover from '@radix-ui/react-popover';
import { Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { PhotoPost } from '../../api/photos';
import { PopoverPanel } from '../ui/PopoverPanel';
import '../profile/MemberMenu.css';
import './PhotoTileMenu.css';

/** The admin `⋯` menu in the corner of a tile (outside the link): Edit and Delete. */
export function PhotoTileMenu({
  post,
  onEdit,
  onDelete,
}: {
  post: PhotoPost;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <div className="photo-menu">
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button type="button" className="button button--icon" aria-label={`Menu for ${post.title}`}>
            <Ellipsis className="icon" aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <PopoverPanel className="member-menu">
          <div className="member-menu__list">
            <button type="button" className="member-menu__item" onClick={run(onEdit)}>
              <Pencil className="icon" aria-hidden="true" />
              Edit
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
