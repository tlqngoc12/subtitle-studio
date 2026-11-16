import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getChapter, updateChapter, type ChapterDetail } from '../api/novels';
import { countText, paragraphs } from './chapterText';
import { errorMessage, type ErrorMessage } from './errors';
import { useChapterPolling } from './useChapterPolling';

/** Unsaved edits are saved by themselves this often (15 minutes). */
export const AUTO_SAVE_MS = 900_000;
const COUNT_DEBOUNCE_MS = 300;

export type FindHits = { matches: { start: number; end: number }[]; current: number | null };
export type LastSave = { kind: 'saved' | 'autosaved'; at: Date };

/**
 * The state of the chapter page: the chapter as the server has it, the edited fields, saving (by hand, Ctrl+S and
 * every 15 minutes), polling while it translates, the counts and the find panel.
 */
export function useChapterEditor(chapterId: number) {
  const [chapter, setChapter] = useState<ChapterDetail | null>(null);
  const [text, setText] = useState('');
  const [number, setNumber] = useState('');
  const [label, setLabel] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSave, setLastSave] = useState<LastSave | null>(null);
  const [finding, setFinding] = useState(false);
  // The matches of the open find panel, painted behind the textarea (it hides its own selection when not focused).
  const [hits, setHits] = useState<FindHits>({ matches: [], current: null });

  // The counts follow the text about 300 ms after the last key, so typing in a long chapter stays light.
  const [counted, setCounted] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setCounted(text), COUNT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);
  const counts = useMemo(() => countText(counted), [counted]);
  const originalParagraphs = useMemo(
    () => (chapter?.sourceText != null ? paragraphs(chapter.sourceText).length : null),
    [chapter?.sourceText],
  );

  /** Takes the server's chapter as the new saved state (drops unsaved edits). */
  function load(c: ChapterDetail) {
    setChapter(c);
    setText(c.text);
    setCounted(c.text);
    setNumber(String(c.chapterNo));
    setLabel(c.label ?? '');
    setTitle(c.title ?? '');
  }

  useEffect(() => {
    setChapter(null);
    setStarting(false); // the page is reused for the chapter just opened
    setLastSave(null);
    getChapter(chapterId)
      .then(load)
      .catch((e) => setError(errorMessage(e)));
  }, [chapterId]);

  const translating = chapter?.translationStatus === 'TRANSLATING';
  const notebookUpdating = chapter?.notebookStatus === 'UPDATING';
  // Poll while this chapter translates, and while the notebook updates (no other chapter can start then).
  useChapterPolling(translating || notebookUpdating ? chapterId : null, (c) => {
    if (!translating) {
      // Only the notebook is running: take its state and keep every edit.
      setChapter((prev) =>
        prev ? { ...prev, notebookStatus: c.notebookStatus, notebookChapterNo: c.notebookChapterNo } : prev,
      );
    } else if (c.translationStatus !== 'TRANSLATING') {
      load(c);
    } else {
      // A fallback model took over: show it, keep the edits.
      setChapter((prev) => (prev ? { ...prev, translationModel: c.translationModel } : prev));
    }
  });

  const dirty =
    chapter !== null &&
    (number !== String(chapter.chapterNo) ||
      label !== (chapter.label ?? '') ||
      title !== (chapter.title ?? '') ||
      text !== chapter.text);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Save is allowed only for a loaded, edited chapter that is not busy/translating and has a Number.
  const canSave = dirty && !translating && !busy && number !== '';
  const saveRef = useRef<(auto: boolean) => Promise<void>>(async () => {});
  const canSaveRef = useRef(canSave);
  canSaveRef.current = canSave;

  // Ctrl+S / ⌘S saves instead of opening the browser's "save page" dialog; Ctrl+H / ⌘H opens find and replace
  // instead of the browser's history.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'h') {
        e.preventDefault();
        setFinding(true);
      } else if (key === 's') {
        e.preventDefault();
        if (canSaveRef.current) void saveRef.current(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // One timer while there are savable unsaved changes; the browser-side checks repeat at fire time.
  useEffect(() => {
    if (!canSave) return;
    const id = window.setInterval(() => {
      if (canSaveRef.current) void saveRef.current(true);
    }, AUTO_SAVE_MS);
    return () => window.clearInterval(id);
  }, [canSave]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function save(auto = false) {
    if (!chapter) return;
    setSaving(true);
    try {
      await run(async () => {
        load(
          await updateChapter(chapterId, {
            chapterNo: Number(number),
            label: label.trim(),
            title: title.trim(),
            text,
          }),
        );
        setLastSave({ kind: auto ? 'autosaved' : 'saved', at: new Date() });
        toast.success(auto ? 'Chapter auto-saved' : 'Chapter saved');
      });
    } finally {
      setSaving(false);
    }
  }
  saveRef.current = save;

  return {
    chapter, setChapter, load,
    text, setText, number, setNumber, label, setLabel, title, setTitle,
    error, setError, busy, run, starting, setStarting, saving, lastSave,
    finding, setFinding, hits, setHits,
    counts, originalParagraphs,
    translating, dirty, canSave, save,
  };
}
