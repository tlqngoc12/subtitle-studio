import * as Popover from '@radix-ui/react-popover';
import { Ellipsis, Send } from 'lucide-react';
import { useState, type ReactNode } from 'react';
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
  /** Draft chapters: `disabledReason` is why Publish cannot run now (null = it can). */
  publish?: { onPublish: () => void; disabledReason: string | null };
  menuItems: ChapterMenuItem[];
  /** Icon buttons shown before Save (find and replace). */
  tools?: ReactNode;
}

/**
 * The sticky bar of the chapter editor: previous/next, the chapter's name and badges, the save state, Save, Publish
 * and a `⋯` menu for the rest. At most one button is primary: Save while there are unsaved changes, otherwise
 * Publish. On phones Publish moves into the menu and the save state drops under the bar.
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
}: ChapterBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const unsaved = saveState.kind === 'dirty' || saveState.kind === 'saving';
  const publishReason = publish ? (unsaved ? 'Save first' : publish.disabledReason) : null;
  const text = saveStateText(saveState);

  function choose(action: () => void) {
    setMenuOpen(false);
    action();
  }

  return (
    <div className="chapter-bar">
      <div className="chapter-bar__nav">{nav}</div>
      <div className="chapter-bar__name">
        <span className="chapter-bar__title">{title}</span>
        {badges}
      </div>
      <p className="chapter-bar__state" aria-live="polite">
        {text}
      </p>
      <div className="chapter-bar__actions">
        {tools}
        <button
          type="button"
          className={unsaved ? 'button button--primary' : 'button'}
          disabled={!canSave}
          onClick={onSave}
        >
          Save
        </button>
        {publish && (
          <Tip label={publishReason ?? ''} disabled={publishReason === null}>
            <span className="chapter-bar__publish">
              <button
                type="button"
                className={unsaved ? 'button' : 'button button--primary'}
                disabled={publishReason !== null}
                onClick={publish.onPublish}
              >
                <Send className="icon" aria-hidden="true" />
                Publish
              </button>
            </span>
          </Tip>
        )}
        <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Tip label="Chapter actions">
            <Popover.Trigger asChild>
              <button type="button" className="button button--icon" aria-label="Chapter actions">
                <Ellipsis className="icon" aria-hidden="true" />
              </button>
            </Popover.Trigger>
          </Tip>
          <PopoverPanel className="member-menu">
            <div className="member-menu__list">
              {publish && (
                // Phones only: the bar has no room for a Publish button there.
                <button
                  type="button"
                  className="member-menu__item chapter-bar__menu-publish"
                  disabled={publishReason !== null}
                  onClick={() => choose(publish.onPublish)}
                >
                  <Send className="icon" aria-hidden="true" />
                  Publish
                </button>
              )}
              {menuItems.map((item) => (
                // A disabled button swallows hover, so the reason's tooltip sits on a span around it.
                <Tip key={item.label} label={item.disabledReason ?? ''} disabled={!item.disabledReason}>
                  <span className="chapter-bar__item">
                    <button
                      type="button"
                      className={item.danger ? 'member-menu__item member-menu__item--danger' : 'member-menu__item'}
                      disabled={item.disabled || Boolean(item.disabledReason)}
                      onClick={() => choose(item.onSelect)}
                    >
                      {item.label}
                    </button>
                  </span>
                </Tip>
              ))}
            </div>
          </PopoverPanel>
        </Popover.Root>
      </div>
    </div>
  );
}
