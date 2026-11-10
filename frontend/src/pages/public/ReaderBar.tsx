import * as Popover from "@radix-ui/react-popover";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  List,
  Settings,
} from "lucide-react";
import { useEffect, useLayoutEffect, useState, type FocusEvent } from "react";
import { createPortal } from "react-dom";
import { useTopbarSlot } from "../../components/TopbarSlot";
import type { ReaderSize, ReaderTheme } from "./readerPrefs";
import { OWN_KEYS } from "./readerKeys";
import { ReaderSettingsPanel } from "./ReaderSettings";
import { IconButton, IconLink } from '../../components/ui/IconButton';
import { PopoverPanel } from '../../components/ui/PopoverPanel';
import './ReaderBar.css';

interface Props {
  slug: string;
  novelTitle: string;
  /** `Chương 5` or the label, without the chapter title. */
  chapterName: string;
  prev: number | null;
  next: number | null;
  /** Whether the site top bar slides away (decided by the page). */
  hidden: boolean;
  /** Reports keyboard focus inside the bar, which keeps the bars shown. */
  onPinnedChange: (pinned: boolean) => void;
  onTocOpenChange: (open: boolean) => void;
  /** Desktop settings popover. */
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  theme: ReaderTheme;
  onTheme: (theme: ReaderTheme) => void;
  size: ReaderSize;
  onSize: (size: ReaderSize) => void;
}

/**
 * The reader's controls: back link with the novel and chapter name, then previous, next, table of contents (a right-side drawer), settings.
 * They are portaled into the site top bar, which they take over from the logo and the menu; the whole top bar slides
 * away while the page scrolls down and returns on scrolling up, near the top, while a popover is open and while
 * keyboard focus is in the controls. Without a top bar (isolated renders) they render in place.
 */
export function ReaderBar({
  slug,
  novelTitle,
  chapterName,
  prev,
  next,
  hidden,
  onPinnedChange,
  onTocOpenChange,
  settingsOpen,
  onSettingsOpenChange,
  theme,
  onTheme,
  size,
  onSize,
}: Props) {
  const [focusIn, setFocusIn] = useState(false);
  const { target, setActive, setHidden } = useTopbarSlot();

  // Claim the top bar while mounted; hand it back (menu again, not slid away) on leaving.
  useLayoutEffect(() => {
    setActive(true);
    return () => {
      setActive(false);
      setHidden(false);
    };
  }, [setActive, setHidden]);
  useEffect(() => setHidden(hidden), [hidden, setHidden]);
  useEffect(() => onPinnedChange(focusIn), [focusIn, onPinnedChange]);
  const to = (no: number) => `/novels/${slug}/${no}`;

  function onFocus(e: FocusEvent<HTMLElement>) {
    // Only keyboard focus pins the bar: after a mouse click the focus stays on the button but must not keep it.
    let keyboard = true;
    try {
      keyboard = e.target.matches(":focus-visible");
    } catch {
      // A browser without :focus-visible: treat every focus as keyboard focus.
    }
    setFocusIn(keyboard);
  }

  function onBlur(e: FocusEvent<HTMLElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null))
      setFocusIn(false);
  }

  const step = (no: number | null, label: string, Icon: typeof ChevronLeft) => (
    no !== null ? (
      <IconLink label={label} icon={Icon} to={to(no)} />
    ) : (
      <IconButton label={label} icon={Icon} disabled />
    )
  );

  const bar = (
    <nav
      className="reader-bar"
      aria-label="Chuyển chương"
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className="reader-bar__inner">
        <div className="reader-bar__left">
          <IconLink label="Về trang truyện" icon={ArrowLeft} to={`/novels/${slug}`} />
          <div className="reader-bar__text">
            <span className="reader-bar__novel">{novelTitle}</span>
            <span className="reader-bar__chapter">{chapterName}</span>
          </div>
        </div>
        <div className="reader-bar__right">
          {step(prev, "Chương trước", ChevronLeft)}
          {step(next, "Chương sau", ChevronRight)}

          <IconButton label="Mục lục" icon={List} onClick={() => onTocOpenChange(true)} />

          <Popover.Root open={settingsOpen} onOpenChange={onSettingsOpenChange}>
            <Popover.Trigger asChild>
              <IconButton label="Cài đặt" icon={Settings} />
            </Popover.Trigger>
            <PopoverPanel
              className="reader-pop reader-settings"
              {...{ [OWN_KEYS]: "" }}
              aria-label="Cài đặt"
            >
              <ReaderSettingsPanel theme={theme} onTheme={onTheme} size={size} onSize={onSize} />
            </PopoverPanel>
          </Popover.Root>
        </div>
      </div>
    </nav>
  );
  return target ? createPortal(bar, target) : bar;
}
