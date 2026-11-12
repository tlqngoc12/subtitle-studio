import * as Popover from '@radix-ui/react-popover';
import { Keyboard } from 'lucide-react';
import { useId } from 'react';
import { useCaptionSize, type CaptionSize } from '../lib/viewerPrefs';
import { Tip } from './Tip';
import { PopoverPanel } from './ui/PopoverPanel';
import './ShortcutsHelp.css';
import { useT } from '../lib/i18n';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Adds the Shift+N / Shift+P rows. */
  playlist: boolean;
}

const KEYS: { keys: string[]; action: string; vi: string; playlistOnly?: boolean }[] = [
  { keys: ['K', 'Space'], action: 'Play / pause', vi: 'Phát / tạm dừng' },
  { keys: ['J', 'L'], action: 'Back / forward 10 seconds', vi: 'Lùi / tới 10 giây' },
  { keys: ['←', '→'], action: 'Back / forward 5 seconds', vi: 'Lùi / tới 5 giây' },
  { keys: ['M'], action: 'Mute / unmute', vi: 'Tắt / bật tiếng' },
  { keys: ['C'], action: 'Show / hide Vietsub', vi: 'Hiện / ẩn Vietsub' },
  { keys: ['F'], action: 'Full screen', vi: 'Toàn màn hình' },
  { keys: ['T'], action: 'Theater mode', vi: 'Chế độ rạp' },
  { keys: ['Shift+P', 'Shift+N'], action: 'Previous / next video', vi: 'Video trước / kế tiếp', playlistOnly: true },
  { keys: ['?'], action: 'This list', vi: 'Danh sách này' },
];

const SIZES: CaptionSize[] = ['s', 'm', 'l'];

/** The keyboard shortcuts of the watch page, plus the caption size, in a popover opened by a button or by the ? key. */
export function ShortcutsHelp({ open, onOpenChange, playlist }: Props) {
  const t = useT();
  const titleId = useId();
  const [size, setSize] = useCaptionSize();
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Tip label={t('Keyboard shortcuts (?)', 'Phím tắt (?)')}>
        <Popover.Trigger asChild>
          <button className="button button--icon" type="button" aria-label={t('Keyboard shortcuts', 'Phím tắt')}>
            <Keyboard className="icon" aria-hidden="true" />
          </button>
        </Popover.Trigger>
      </Tip>
      <PopoverPanel className="shortcuts" aria-labelledby={titleId}>
        <p className="shortcuts__title" id={titleId}>
          {t('Keyboard shortcuts', 'Phím tắt')}
        </p>
        <dl className="shortcuts__list">
          {KEYS.filter((k) => playlist || !k.playlistOnly).map((k) => (
            <div className="shortcuts__row" key={k.action}>
              <dt>
                {k.keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </dt>
              <dd>{t(k.action, k.vi)}</dd>
            </div>
          ))}
        </dl>
        <div className="shortcuts__sizes" role="radiogroup" aria-label={t('Caption size', 'Cỡ chữ phụ đề')}>
          <span className="shortcuts__sizes-label" aria-hidden="true">
            {t('Caption size', 'Cỡ chữ phụ đề')}
          </span>
          {SIZES.map((s) => (
            <button
              key={s}
              className="shortcuts__option"
              type="button"
              role="radio"
              aria-checked={s === size}
              onClick={() => setSize(s)}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </PopoverPanel>
    </Popover.Root>
  );
}
