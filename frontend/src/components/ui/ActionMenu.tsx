import * as Popover from '@radix-ui/react-popover';
import { Ellipsis, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Tip } from '../Tip';
import { IconButton } from './IconButton';
import { PopoverPanel } from './PopoverPanel';
import '../profile/MemberMenu.css';
import './ActionMenu.css';

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  /** Disabled, and why: shown in a tooltip before the click. */
  disabledReason?: string;
}

/** A `⋯` icon button that opens a list of actions; a disabled action says why in a tooltip. */
export function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <IconButton label={label} icon={Ellipsis} />
      </Popover.Trigger>
      <PopoverPanel className="member-menu">
        <div className="member-menu__list">
          {items.map((item) => (
            <Tip key={item.label} label={item.disabledReason ?? ''} disabled={!item.disabledReason}>
              <span className="action-menu__item">
                <button
                  type="button"
                  className="member-menu__item"
                  disabled={item.disabled || Boolean(item.disabledReason)}
                  onClick={() => choose(item.onSelect)}
                >
                  {item.icon && <item.icon className="icon" aria-hidden="true" />}
                  {item.label}
                </button>
              </span>
            </Tip>
          ))}
        </div>
      </PopoverPanel>
    </Popover.Root>
  );
}
