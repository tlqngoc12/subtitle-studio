import * as Popover from '@radix-ui/react-popover';
import { Keyboard } from 'lucide-react';
import { useId } from 'react';
import { Tip } from './Tip';
import { PopoverPanel } from './ui/PopoverPanel';
import './ShortcutsHelp.css';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Adds the Shift+N / Shift+P rows. */
  playlist: boolean;
}

const KEYS: { keys: string[]; action: string; playlistOnly?: boolean }[] = [
  { keys: ['K', 'Space'], action: 'Play / pause' },
  { keys: ['J', 'L'], action: 'Back / forward 10 seconds' },
  { keys: ['←', '→'], action: 'Back / forward 5 seconds' },
  { keys: ['M'], action: 'Mute / unmute' },
  { keys: ['C'], action: 'Show / hide Vietsub' },
  { keys: ['F'], action: 'Full screen' },
  { keys: ['Shift+P', 'Shift+N'], action: 'Previous / next video', playlistOnly: true },
  { keys: ['?'], action: 'This list' },
];

/** The keyboard shortcuts of the watch page, in a popover opened by a button or by the ? key. */
export function ShortcutsHelp({ open, onOpenChange, playlist }: Props) {
  const titleId = useId();
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Tip label="Keyboard shortcuts (?)">
        <Popover.Trigger asChild>
          <button className="button button--icon" type="button" aria-label="Keyboard shortcuts">
            <Keyboard className="icon" aria-hidden="true" />
          </button>
        </Popover.Trigger>
      </Tip>
      <PopoverPanel className="shortcuts" aria-labelledby={titleId}>
        <p className="shortcuts__title" id={titleId}>
          Keyboard shortcuts
        </p>
        <dl className="shortcuts__list">
          {KEYS.filter((k) => playlist || !k.playlistOnly).map((k) => (
            <div className="shortcuts__row" key={k.action}>
              <dt>
                {k.keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </dt>
              <dd>{k.action}</dd>
            </div>
          ))}
        </dl>
      </PopoverPanel>
    </Popover.Root>
  );
}
