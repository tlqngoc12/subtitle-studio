import { ListChecks, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  fetchAndTranslateWattpadPart,
  listWattpadParts,
  type ChapterTranslationStatus,
  type NovelDetail,
  type WattpadPart,
} from '../../api/novels';
import { formatInstant } from '../../lib/dates';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { toastError } from '../../lib/toast';
import { EmptyState } from '../EmptyState';
import { Alert } from '../ui/Alert';
import { LoadingText } from '../ui/LoadingText';
import { useConfirmDialog } from '../useConfirmDialog';
import './WattpadParts.css';

type RowState = 'NEW' | ChapterTranslationStatus;

/** True while a chapter of the novel translates or its notebook updates: one translation at a time. */
export function novelIsBusy(novel: NovelDetail): boolean {
  return novel.chapters.some((c) => c.translationStatus === 'TRANSLATING') || novel.notebookStatus === 'UPDATING';
}

/**
 * The "Wattpad" tab of a Wattpad novel: the story's parts, one button per part. "Fetch & translate" fetches the
 * original and starts the translation; the next untranslated part is marked "Next". Row states come from the novel
 * (polled by the page), so the parts list is loaded from Wattpad only when the tab opens or on "Check for new
 * chapters".
 */
export function WattpadParts({ novel, onChanged }: { novel: NovelDetail; onChanged: () => void | Promise<void> }) {
  const novelId = novel.id;
  const [parts, setParts] = useState<WattpadPart[] | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const { confirm, dialog } = useConfirmDialog();

  const load = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      setParts(await listWattpadParts(novelId));
    } catch (e) {
      setError(errorMessage(e));
      setParts((p) => p ?? []);
    } finally {
      setChecking(false);
    }
  }, [novelId]);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = novelIsBusy(novel);
  const locked = busy || pending;

  const stateOf = (p: WattpadPart): RowState => {
    if (p.importedChapterId === null) return 'NEW';
    return novel.chapters.find((c) => c.id === p.importedChapterId)?.translationStatus ?? 'NONE';
  };
  const list = parts ?? [];
  const nextIndex = list.findIndex((p) => !p.deleted && stateOf(p) !== 'TRANSLATED');

  async function run(p: WattpadPart, index: number) {
    if (inFlight.current || busy) return;
    inFlight.current = true;
    try {
      if (nextIndex !== -1 && nextIndex < index) {
        const next = list[nextIndex];
        const ok = await confirm({
          title: `${next.title} is not translated yet.`,
          description: `The notebook will not know about it. Translate ${p.title} anyway?`,
          confirmLabel: 'Translate anyway',
        });
        if (!ok) return;
      }
      setPending(true);
      try {
        await fetchAndTranslateWattpadPart(novelId, p.partId);
        toast.info('Translation started', { description: p.title });
      } catch (e) {
        toastError(errorMessage(e));
      }
      await onChanged();
      await load();
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }

  return (
    <section className="wattpad-parts" aria-label="Wattpad chapters">
      <div className="wattpad-parts__toolbar">
        <button type="button" className="button button--s" disabled={checking || pending}
          onClick={() => void load()}>
          <RefreshCw className="icon" aria-hidden="true" />
          {checking ? 'Checking…' : 'Check for new chapters'}
        </button>
      </div>

      {error && <Alert title={error.title} hint={error.hint} />}
      {parts === null && !error && <LoadingText>Loading parts from Wattpad…</LoadingText>}
      {parts !== null && parts.length === 0 && !error && (
        <EmptyState icon={ListChecks}>Wattpad lists no parts for this story.</EmptyState>
      )}
      {parts !== null && parts.length > 0 && (
        <ul className="wattpad-parts__list" aria-label="Parts">
          {parts.map((p, index) => {
            const state = stateOf(p);
            const isNext = index === nextIndex;
            return (
              <li key={p.partId} className="wattpad-parts__row">
                <span className="wattpad-parts__title">{p.title}</span>
                <span className="wattpad-parts__meta">
                  <span className="meta">{p.wordCount.toLocaleString('en-US')} words</span>
                  {p.modifiedAt && <span className="meta">{formatInstant(p.modifiedAt)}</span>}
                  {p.deleted && (
                    <span className="badge badge--progress">
                      <Trash2 className="icon icon--sm" aria-hidden="true" />
                      Deleted
                    </span>
                  )}
                  {isNext && <span className="badge badge--info">Next</span>}
                  {state === 'FAILED' && <span className="badge badge--failed">Failed</span>}
                </span>
                <span className="wattpad-parts__action">
                  {state === 'TRANSLATING' && <span className="meta">Translating…</span>}
                  {state === 'TRANSLATED' && (
                    <Link className="badge badge--info" to={`/novels/${novelId}/chapters/${p.importedChapterId}`}
                      aria-label={`Translated: open ${p.title}`}>
                      Translated
                    </Link>
                  )}
                  {(state === 'NEW' || state === 'NONE' || state === 'FAILED') && !p.deleted && (
                    <button type="button" disabled={locked}
                      className={`button button--s${isNext ? ' button--primary' : ''}`}
                      aria-label={`${state === 'NEW' ? 'Fetch & translate' : 'Translate'} ${p.title}`}
                      onClick={() => void run(p, index)}>
                      {state === 'NEW' ? 'Fetch & translate' : 'Translate'}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {dialog}
    </section>
  );
}
