import * as Dialog from "@radix-ui/react-dialog";
import { Check, X } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import { Link } from "react-router";
import { IconButton } from "../../components/ui/IconButton";
import type { PublicChapterRef } from "../../data/novelTypes";
import { publicChapterLabel } from "./publicNames";
import { readReadChapters } from "./readerPrefs";
import { OWN_KEYS } from "./readerKeys";
import "./ReaderBar.css";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  chapters: PublicChapterRef[];
  currentNo: number;
  /** Element to focus on closing: the drawer has no trigger of its own, so Radix cannot restore focus. */
  restoreFocus?: RefObject<HTMLElement | null>;
}

/** The table of contents: a right-side drawer listing the chapters, the one being read marked. */
export function ReaderTocDrawer({ open, onOpenChange, slug, chapters, currentNo, restoreFocus }: Props) {
  const drawer = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer__overlay" />
        <Dialog.Content
          ref={drawer}
          className="drawer"
          {...{ [OWN_KEYS]: "" }}
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            if (!restoreFocus?.current) return;
            e.preventDefault();
            restoreFocus.current.focus();
          }}
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
            <ChapterToc slug={slug} chapters={chapters} currentNo={currentNo} onPick={() => onOpenChange(false)} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
