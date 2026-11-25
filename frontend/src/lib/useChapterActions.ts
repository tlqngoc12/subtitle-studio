import { toast } from 'sonner';
import {
  addChapter,
  fetchTranslateNext,
  publishChapter,
  reloadChapterOriginal,
  translateChapter,
  unpublishChapter,
  type ChapterDetail,
} from '../api/novels';
import type { Dispatch, SetStateAction } from 'react';
import type { ConfirmOptions } from '../components/useConfirmDialog';
import { errorMessage } from './errors';
import { toastError, toastSkippedImages } from './toast';

type Params = {
  chapterId: number;
  chapter: ChapterDetail | null;
  dirty: boolean;
  load: (c: ChapterDetail) => void;
  setChapter: Dispatch<SetStateAction<ChapterDetail | null>>;
  setStarting: (starting: boolean) => void;
  run: (action: () => Promise<void>) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Opens another chapter of the same novel. */
  openChapter: (id: number) => void;
};

/** The chapter-level actions of the chapter page: translate, fetch the next Wattpad part, reload the original, (un)publish. */
export function useChapterActions({
  chapterId, chapter, dirty, load, setChapter, setStarting, run, confirm, openChapter,
}: Params) {
  async function translate() {
    if (!chapter) return;
    const landscape = chapter.pages.filter((p) => p.landscape).length;
    if (landscape > 0) {
      const ok = await confirm({
        title: 'Landscape pages',
        description: `${landscape} page(s) are landscape — Gemini reads sideways text poorly. Translate anyway?`,
        confirmLabel: 'Translate anyway',
      });
      if (!ok) return;
    }
    if (chapter.editedAfterTranslation || dirty) {
      const ok = await confirm({
        title: 'Translate this chapter again?',
        description: "Your edits will be replaced by Gemini's new translation.",
        confirmLabel: 'Translate again',
      });
      if (!ok) return;
    }
    await run(async () => load(await translateChapter(chapterId)));
  }

  /** Fetches and translates the next Wattpad part, then opens its chapter (it polls itself while translating). */
  async function startNext() {
    if (!chapter) return;
    if (dirty) {
      const ok = await confirm({
        title: 'Leave without saving?',
        description: 'Your changes to this chapter are not saved yet.',
        confirmLabel: 'Leave',
        destructive: true,
      });
      if (!ok) return;
    }
    setStarting(true);
    try {
      const next = await fetchTranslateNext(chapter.novelId);
      toast.info('Translation started', {
        description: next.title,
      });
      toastSkippedImages(next.skippedImages);
      openChapter(next.id);
    } catch (e) {
      toastError(errorMessage(e));
      setStarting(false);
    }
  }

  /** Creates the next (empty) chapter of an original or screenshot novel, then opens it. */
  async function addNext() {
    if (!chapter) return;
    if (dirty) {
      const ok = await confirm({
        title: 'Leave without saving?',
        description: 'Your changes to this chapter are not saved yet.',
        confirmLabel: 'Leave',
        destructive: true,
      });
      if (!ok) return;
    }
    setStarting(true);
    try {
      const next = await addChapter(chapter.novelId, {});
      openChapter(next.id);
    } catch (e) {
      toastError(errorMessage(e));
      setStarting(false);
    }
  }

  async function reloadOriginal() {
    const ok = await confirm({
      title: 'Reload the original text?',
      description: 'The original is fetched from Wattpad again and replaces the one shown here. Your translation is not changed.',
      confirmLabel: 'Reload original',
    });
    if (!ok) return;
    await run(async () => {
      const fresh = await reloadChapterOriginal(chapterId);
      // Only the original changes: edits in the boxes below stay.
      setChapter((c) => (c ? { ...c, sourceText: fresh.sourceText, sourceFetchedAt: fresh.sourceFetchedAt } : c));
      toast.success('Original text reloaded');
      toastSkippedImages(fresh.skippedImages);
    });
  }

  const publish = () => run(async () => load(await publishChapter(chapterId)));
  const unpublish = () => run(async () => load(await unpublishChapter(chapterId)));

  return { translate, startNext, addNext, reloadOriginal, publish, unpublish };
}
