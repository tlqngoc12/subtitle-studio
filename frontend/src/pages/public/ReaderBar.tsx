import * as Popover from "@radix-ui/react-popover";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  List,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import { Link } from "react-router";
import { Tip } from "../../components/Tip";
import type { PublicChapterRef } from "../../data/novelTypes";
import { useHideOnScroll } from "../../lib/useHideOnScroll";
import { publicChapterLabel } from "./publicNames";
import {
  READER_WIDTHS,
  readReadChapters,
  type ReaderWidth,
} from "./readerPrefs";

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
  night: boolean;
  onToggleNight: () => void;
  width: ReaderWidth;
  onStepWidth: (delta: number) => void;
}

/**
 * The sticky icon bar of the reader: previous, next, table of contents, settings. It slides away while the page
 * scrolls down and returns on scrolling up, near the top, while a popover is open and while keyboard focus is in it.
 */
export function ReaderBar({
  slug,
  novelTitle,
  chapterName,
  prev,
  next,
  chapters,
  currentNo,
  night,
  onToggleNight,
  width,
  onStepWidth,
}: Props) {
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const hidden = useHideOnScroll(tocOpen || settingsOpen || focusIn);
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
    <Tip label={label}>
      {no !== null ? (
        <Link className="button button--icon" to={to(no)} aria-label={label}>
          <Icon className="icon" aria-hidden="true" />
        </Link>
      ) : (
        <button
          className="button button--icon"
          type="button"
          disabled
          aria-label={label}
        >
          <Icon className="icon" aria-hidden="true" />
        </button>
      )}
    </Tip>
  );

  const widthStep = READER_WIDTHS.indexOf(width);
  return (
    <nav
      className={hidden ? "reader-bar reader-bar--hidden" : "reader-bar"}
      aria-label="Chuyển chương"
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className="reader-bar__inner">
        <div className="reader-bar__left">
          <Tip label="Về trang truyện">
            <Link
              className="button button--icon"
              to={`/novels/${slug}`}
              aria-label="Về trang truyện"
            >
              <ArrowLeft className="icon" aria-hidden="true" />
            </Link>
          </Tip>
          <div className="reader-bar__text">
            <span className="reader-bar__novel">{novelTitle}</span>
            <span className="reader-bar__chapter">{chapterName}</span>
          </div>
        </div>
        <div className="reader-bar__right">
          {step(prev, "Chương trước", ChevronLeft)}
          {step(next, "Chương sau", ChevronRight)}

          <Popover.Root open={tocOpen} onOpenChange={setTocOpen}>
            <Tip label="Mục lục">
              <Popover.Trigger asChild>
                <button
                  className="button button--icon"
                  type="button"
                  aria-label="Mục lục"
                >
                  <List className="icon" aria-hidden="true" />
                </button>
              </Popover.Trigger>
            </Tip>
            <Popover.Portal>
              <Popover.Content
                className="reader-pop reader-toc"
                side="bottom"
                align="end"
                sideOffset={6}
                collisionPadding={8}
                {...{ [OWN_KEYS]: "" }}
                aria-label="Mục lục"
              >
                <ChapterToc
                  slug={slug}
                  chapters={chapters}
                  currentNo={currentNo}
                  onPick={() => setTocOpen(false)}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          <Popover.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
            <Tip label="Cài đặt">
              <Popover.Trigger asChild>
                <button
                  className="button button--icon"
                  type="button"
                  aria-label="Cài đặt"
                >
                  <Settings className="icon" aria-hidden="true" />
                </button>
              </Popover.Trigger>
            </Tip>
            <Popover.Portal>
              <Popover.Content
                className="reader-pop reader-settings"
                side="bottom"
                align="end"
                sideOffset={6}
                collisionPadding={8}
                {...{ [OWN_KEYS]: "" }}
                aria-label="Cài đặt"
              >
                <button
                  type="button"
                  className="button button--small"
                  aria-pressed={night}
                  onClick={onToggleNight}
                >
                  {night ? (
                    <Sun className="icon" aria-hidden="true" />
                  ) : (
                    <Moon className="icon" aria-hidden="true" />
                  )}
                  Chế độ đêm
                </button>
                <div className="reader-settings__size">
                  <button
                    type="button"
                    className="button button--small"
                    aria-label="Chữ nhỏ hơn"
                    disabled={widthStep <= 0}
                    onClick={() => onStepWidth(-1)}
                  >
                    A−
                  </button>
                  <button
                    type="button"
                    className="button button--small"
                    aria-label="Chữ lớn hơn"
                    disabled={widthStep >= READER_WIDTHS.length - 1}
                    onClick={() => onStepWidth(1)}
                  >
                    A+
                  </button>
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>
    </nav>
  );
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
  // Mounted when the popover opens: bring the chapter being read to the middle of the scrolling list.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <ol className="reader-toc__list" aria-label="Danh sách chương">
      {chapters.map((c) => {
        const current = c.chapterNo === currentNo;
        return (
          <li key={c.chapterNo} className="reader-toc__item">
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
