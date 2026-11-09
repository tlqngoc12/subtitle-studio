import { useEffect } from 'react';
import type { NovelStatus } from '../../api/novels';

/** Vietnamese names and copy shared by the public Novels pages (the admin UI stays English). */

/** The chapter's label ("Ngoại truyện 1"), or "Chương N". */
export function publicChapterName(chapterNo: number, label?: string | null): string {
  return label?.trim() ? label.trim() : `Chương ${chapterNo}`;
}

/** The name with the title: "Chương 3: Mưa", "Ngoại truyện 1: Ngày cưới". */
export function publicChapterLabel(chapterNo: number, title: string | null, label?: string | null): string {
  const name = publicChapterName(chapterNo, label);
  return title ? `${name}: ${title}` : name;
}

export const PUBLIC_STATUS_LABEL: Record<NovelStatus, string> = { ONGOING: 'Đang ra', COMPLETED: 'Hoàn thành' };

export function publicChapterCount(count: number): string {
  return `${count} chương`;
}

/** What guests see for any load error, whatever the cause. */
export const PUBLIC_ERROR_TITLE = 'Không tải được. Vui lòng thử lại sau.';

/** Sets `document.title` while the page is shown (ignored while `title` is null) and restores the previous one. */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
