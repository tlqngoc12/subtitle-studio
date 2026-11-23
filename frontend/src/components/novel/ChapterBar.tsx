import * as Popover from '@radix-ui/react-popover';
import { Ellipsis, Send, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatClock } from '../../lib/dates';
import { Tip } from '../Tip';
import { PopoverPanel } from '../ui/PopoverPanel';
import '../profile/MemberMenu.css';
import './ChapterBar.css';

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'saved' | 'autosaved'; at: Date };

export interface ChapterMenuItem {
  label: string;
  onSelect: () => void;
  /** Red: it overwrites work (Translate again). */
  danger?: boolean;
  disabled?: boolean;
  /** Disabled, and why: shown in a tooltip before the click. */
  disabledReason?: string;
  /** Shown before the label. */
  icon?: LucideIcon;
}

export function saveStateText(state: SaveState): string {
  switch (state.kind) {
    case 'dirty':
      return 'Unsaved changes';
    case 'saving':
      return 'Saving…';
    case 'saved':
      return `Saved ${formatClock(state.at)}`;
    case 'autosaved':
      return `Auto-saved ${formatClock(state.at)}`;
    default:
      return '';
  }
}

export interface ChapterBarProps {
  nav: ReactNode;
  title: string;
  badges: ReactNode;
  saveState: SaveState;
  canSave: boolean;
  onSave: () => void;
  /** Draft chapters: Publish is the menu's first item; `disabledReason` is why it cannot run now (null = it can). */
  publish?: { onPublish: () => void; disabledReason: string | null };
  menuItems: ChapterMenuItem[];
  /** Icon buttons shown before Save (find and replace). */
  tools?: ReactNode;
  /** A full-width row inside the sticky bar, under everything else (the find and replace panel). */
  below?: ReactNode;
  /** Receives the empty slot where the Check navigator is portalled in while Check is on. */
  checkSlotRef?: (el: HTMLDivElement | null) => void;
}

/**
 * The sticky bar of the chapter editor: previous/next, the chapter's name and badges, the save state, Save and a `⋯`
 * menu with the rest (Publish first). Save is primary while there are unsaved changes. On phones the save state drops
 * under the bar.
 */
export function ChapterBar({
  nav,
  title,
  badges,
  saveState,
  canSave,
  onSave,
  publish,
  menuItems,
  tools,
  below,
  checkSlotRef,
}: ChapterBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // The bar grows (find panel, wrapping on narrow widths): tell the page, so what sticks under it starts below it.
  useEffect(() => {
    const el = root.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const measure = () => parent.style.setProperty('--chapter-bar-h', `${el.getBoundingClientRect().height}px`);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
      parent.style.removeProperty('--chapter-bar-h');
    };
  }, []);
  const unsaved = saveState.kind === 'dirty' || saveState.kind === 'saving';
  const publishReason = publish ? (unsaved ? 'Save first' : publish.disabledReason) : null;
  const text = saveStateText(saveState);
  // Publish is the menu's first item; the reason it cannot run now shows in its tooltip.
  const items: ChapterMenuItem[] = [
    ...(publish
      ? [{ label: 'Publish', icon: Send, onSelect: publish.onPublish, disabledReason: publishReason ?? undefined }]
      : []),
    ...menuItems,
  ];

  function choose(action: () => void) {
    setMenuOpen(false);
    action();
  }

  return (
    <div ref={root} className={below ? 'chapter-bar chapter-bar--with-below' : 'chapter-bar'}>
      <div className="chapter-bar__nav">{nav}</div>
      <div className="chapter-bar__name">
        <span className="chapter-bar__title">{title}</span>
        {badges}
      </div>
      <p className="chapter-bar__state" aria-live="polite">
        {text}
      </p>
      <div className="chapter-bar__actions">
        <div ref={checkSlotRef} className="chapter-bar__check" />
        {tools}
        <button
          type="button"
          className={unsaved ? 'button button--primary' : 'button'}
          disabled={!canSave}
          onClick={onSave}
        >
          Save
        </button>
        <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Tip label="Chapter actions">
            <Popover.Trigger asChild>
              <button type="button" aria-label="Chapter actions" className="button button--icon">
                <Ellipsis className="icon" aria-hidden="true" />
              </button>
            </Popover.Trigger>
          </Tip>
          <PopoverPanel className="member-menu">
            <div className="member-menu__list">
              {items.map((item) => (
                // A disabled button swallows hover, so the reason's tooltip sits on a span around it.
                <Tip key={item.label} label={item.disabledReason ?? ''} disabled={!item.disabledReason}>
                  <span className="chapter-bar__item">
                    <button
                      type="button"
                      className={item.danger ? 'member-menu__item member-menu__item--danger' : 'member-menu__item'}
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
      </div>
      {below && <div className="chapter-bar__below">{below}</div>}
    </div>
  );
}
