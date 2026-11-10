import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  List,
  Settings,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { useTopbarSlot } from "../../components/TopbarSlot";
import type { PublicChapterRef } from "../../data/novelTypes";
import { useHideOnScroll } from "../../lib/useHideOnScroll";
import { publicChapterLabel } from "./publicNames";
import { readReadChapters, type ReaderSize, type ReaderTheme } from "./readerPrefs";
import { ReaderSettingsPanel } from "./ReaderSettings";
import { IconButton, IconLink } from '../../components/ui/IconButton';
import { PopoverPanel } from '../../components/ui/PopoverPanel';
import './ReaderBar.css';

/** Attribute that marks a popover whose keys (the arrows) belong to it, not to chapter navigation. */
export const OWN_KEYS = "data-own-keys";

interface Props {
  slug: string;
  novelTitle: string;
  /** `Chương 5` or the label, without the chapter title. */
  chapterName: string;
  prev: number | null;
  next: number | null;
  chapters: PublicChapterRef[];
  currentNo: number;
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
  chapters,
  currentNo,
  theme,
  onTheme,
  size,
  onSize,
}: Props) {
  const [tocOpen, setTocOpen] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const hidden = useHideOnScroll(tocOpen || settingsOpen || focusIn);
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

          <Dialog.Root open={tocOpen} onOpenChange={setTocOpen}>
            <Dialog.Trigger asChild>
              <IconButton label="Mục lục" icon={List} />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="drawer__overlay" />
              <Dialog.Content
                ref={drawer}
                className="drawer"
                {...{ [OWN_KEYS]: "" }}
                aria-describedby={undefined}
                // Land on the drawer itself, not on the close button: its tooltip would take the first Esc.
                onOpenAutoFocus={(e) => {
                  e.preventDefault();
                  drawer.current?.focus();
                }}
              >
                <div className="drawer__head">
                  <Dialog.Title className="drawer__title">Mục lục</Dialog.Title>
                  <Dialog.Close asChild>
                    <IconButton label="Đóng" icon={X} />
                  </Dialog.Close>
                </div>
                <div className="drawer__body">
                  <ChapterToc
                    slug={slug}
                    chapters={chapters}
                    currentNo={currentNo}
                    onPick={() => setTocOpen(false)}
                  />
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          <Popover.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
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

function ChapterToc({
  slug,
  chapters,
  currentNo,
  onPick,
}: {
  slug: string;
  chapters: PublicChapterRef[];
  currentNo: number;
  onPick: () => void;
}) {
  const read = new Set(readReadChapters(slug));
  const currentRef = useRef<HTMLAnchorElement>(null);
  // Mounted when the drawer opens: bring the chapter being read to the middle of the scrolling drawer body.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <ol className="reader-toc__list" aria-label="Danh sách chương">
      {chapters.map((c) => {
        const current = c.chapterNo === currentNo;
        return (
          <li
            key={c.chapterNo}
            className={
              current
                ? "reader-toc__item reader-toc__item--current"
                : "reader-toc__item"
            }
          >
            <Link
              ref={current ? currentRef : undefined}
              className={
                current
                  ? "reader-toc__link reader-toc__link--current"
                  : "reader-toc__link"
              }
              to={`/novels/${slug}/${c.chapterNo}`}
              aria-current={current ? "true" : undefined}
              onClick={onPick}
            >
              {publicChapterLabel(c.chapterNo, c.title, c.label)}
            </Link>
            {current && <span className="badge badge--info">Đang đọc</span>}
            {!current && read.has(c.chapterNo) && (
              <Check
                className="icon chapter-list__check"
                role="img"
                aria-label="Đã đọc"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
