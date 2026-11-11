import * as Popover from '@radix-ui/react-popover';
import { ArrowDown, ArrowUp, Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { PopoverPanel } from '../ui/PopoverPanel';
import './MemberMenu.css';

/** Edit-mode menu of one member: edit the header, move up or down the page, delete the member (red). */
export function MemberMenu({
  name,
  isFirst,
  isLast,
  onEdit,
  onMove,
  onDelete,
}: {
  name: string;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onMove: (direction: 'UP' | 'DOWN') => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="button button--icon" aria-label={`${name} menu`}>
          <Ellipsis className="icon" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <PopoverPanel className="member-menu">
        <div className="member-menu__list">
          <button type="button" className="member-menu__item" onClick={run(onEdit)}>
            <Pencil className="icon" aria-hidden="true" />
            Edit header
          </button>
          <button type="button" className="member-menu__item" disabled={isFirst} onClick={run(() => onMove('UP'))}>
            <ArrowUp className="icon" aria-hidden="true" />
            Move up
          </button>
          <button type="button" className="member-menu__item" disabled={isLast} onClick={run(() => onMove('DOWN'))}>
            <ArrowDown className="icon" aria-hidden="true" />
            Move down
          </button>
          <button type="button" className="member-menu__item member-menu__item--danger" onClick={run(onDelete)}>
            <Trash2 className="icon" aria-hidden="true" />
            Delete member
          </button>
        </div>
      </PopoverPanel>
    </Popover.Root>
  );
}
