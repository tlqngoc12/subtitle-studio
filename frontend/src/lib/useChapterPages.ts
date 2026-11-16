import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  deletePage,
  reorderPages,
  rotatePage,
  rotatePages,
  uploadPages,
  type ChapterDetail,
  type PageDto,
  type RotateDirection,
} from '../api/novels';
import type { ConfirmOptions } from '../components/useConfirmDialog';
import { errorMessage, type ErrorMessage } from './errors';

type Params = {
  chapterId: number;
  chapter: ChapterDetail | null;
  setChapter: Dispatch<SetStateAction<ChapterDetail | null>>;
  setError: (e: ErrorMessage | null) => void;
  run: (action: () => Promise<void>) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

/** What the chapter page does with its page screenshots: upload, reorder, rotate, delete, and the enlarged view. */
export function useChapterPages({ chapterId, chapter, setChapter, setError, run, confirm }: Params) {
  const [uploading, setUploading] = useState(false);
  const [enlarged, setEnlarged] = useState<number | null>(null);

  async function upload(files: File[]) {
    setUploading(true);
    setError(null);
    try {
      const pages = await uploadPages(chapterId, files);
      setChapter((c) => (c ? { ...c, pages } : c));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function reorder(next: PageDto[]) {
    if (!chapter) return;
    const previous = chapter.pages;
    setChapter({ ...chapter, pages: next });
    try {
      const saved = await reorderPages(chapterId, next.map((p) => p.id));
      setChapter((c) => (c ? { ...c, pages: saved } : c));
    } catch (e) {
      setError(errorMessage(e));
      setChapter((c) => (c ? { ...c, pages: previous } : c));
    }
  }

  async function rotate(page: PageDto, direction: RotateDirection) {
    await run(async () => {
      const pages = await rotatePage(chapterId, page.id, direction);
      setChapter((c) => (c ? { ...c, pages } : c));
    });
  }

  async function rotateAll(direction: RotateDirection) {
    await run(async () => {
      const pages = await rotatePages(chapterId, direction);
      setChapter((c) => (c ? { ...c, pages } : c));
    });
  }

  async function removePage(page: PageDto, n: number) {
    const ok = await confirm({
      title: `Delete page ${n}?`,
      description: 'The screenshot and its translation are deleted.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await run(async () => {
      await deletePage(chapterId, page.id);
      setChapter((c) =>
        c ? { ...c, pages: c.pages.filter((p) => p.id !== page.id).map((p, i) => ({ ...p, position: i + 1 })) } : c,
      );
    });
  }

  return { uploading, enlarged, setEnlarged, upload, reorder, rotate, rotateAll, removePage };
}
