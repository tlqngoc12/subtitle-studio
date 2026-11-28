import * as Dialog from '@radix-ui/react-dialog';
import { Trash2, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { ApiError } from '../../api/client';
import {
  listWattpadParts,
  syncChapterFromWattpad,
  type ChapterDetail,
  type WattpadPart,
} from '../../api/novels';
import { formatInstant } from '../../lib/dates';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { Alert } from '../ui/Alert';
import { FormActions } from '../ui/FormActions';
import { IconButton } from '../ui/IconButton';
import { LoadingText } from '../ui/LoadingText';
import '../CreatePlaylistDialog.css';
import './WattpadSyncDialog.css';

/** A title for comparing: NFC, trimmed, inner whitespace collapsed, case ignored. */
export function normalizeTitle(title: string): string {
  return title.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The first part (not deleted) whose name is the chapter's title, or null. */
export function sameTitlePart(parts: WattpadPart[], chapterTitle: string): WattpadPart | null {
  const wanted = normalizeTitle(chapterTitle);
  return parts.find((p) => !p.deleted && normalizeTitle(p.title) === wanted) ?? null;
}

/** The part (not deleted) the chapter was last synced from, or null. */
export function linkedPart(parts: WattpadPart[], linkedPartId: string | null): WattpadPart | null {
  if (!linkedPartId) return null;
  return parts.find((p) => !p.deleted && p.partId === linkedPartId) ?? null;
}

/** The message of a failed load or sync; a story without a link says so in the words of this feature. */
function syncError(e: unknown): ErrorMessage {
  if (e instanceof ApiError && e.code === 'NOVEL_NOT_WATTPAD') return { title: 'This story has no Wattpad link.' };
  return errorMessage(e);
}

/**
 * "Sync from Wattpad": lists the parts of the story's linked Wattpad story (once per opening), asks which one, then
 * confirms before replacing the chapter's text. Its content is mounted only while open.
 */
export function WattpadSyncDialog({
  open,
  onOpenChange,
  novelId,
  chapterId,
  chapterTitle,
  linkedPartId = null,
  onSynced,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  novelId: number;
  chapterId: number;
  chapterTitle: string;
  /** The part the chapter was last synced from: preselected and labelled Linked, ahead of Same title. */
  linkedPartId?: string | null;
  /** Called with the chapter the server returned, after the dialog closes. */
  onSynced: (chapter: ChapterDetail) => void;
}) {
  // While the text is being replaced the dialog cannot be closed.
  const [syncing, setSyncing] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (syncing ? undefined : onOpenChange(next))}>
      <Dialog.Portal>
        <Dialog.Overlay className="pldialog__overlay" />
        <Dialog.Content className="pldialog wattpad-sync" aria-describedby={undefined}>
          <div className="pldialog__head">
            <Dialog.Title className="pldialog__title">Sync from Wattpad</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={X} disabled={syncing} />
            </Dialog.Close>
          </div>
          <SyncBody
            novelId={novelId}
            chapterId={chapterId}
            chapterTitle={chapterTitle}
            linkedPartId={linkedPartId}
            syncing={syncing}
            setSyncing={setSyncing}
            onCancel={() => onOpenChange(false)}
            onSynced={(chapter) => {
              setSyncing(false);
              onOpenChange(false);
              onSynced(chapter);
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SyncBody({
  novelId,
  chapterId,
  chapterTitle,
  linkedPartId,
  syncing,
  setSyncing,
  onCancel,
  onSynced,
}: {
  novelId: number;
  chapterId: number;
  chapterTitle: string;
  linkedPartId: string | null;
  syncing: boolean;
  setSyncing: (syncing: boolean) => void;
  onCancel: () => void;
  onSynced: (chapter: ChapterDetail) => void;
}) {
  const ids = useId();
  const [parts, setParts] = useState<WattpadPart[] | null>(null);
  const [loadError, setLoadError] = useState<ErrorMessage | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);

  // One request to Wattpad per opening (and per Retry); the list is never polled.
  useEffect(() => {
    let current = true;
    setParts(null);
    setLoadError(null);
    listWattpadParts(novelId)
      .then((list) => {
        if (!current) return;
        setParts(list);
        setSelected(linkedPart(list, linkedPartId)?.partId ?? sameTitlePart(list, chapterTitle)?.partId ?? null);
      })
      .catch((e) => {
        if (current) setLoadError(syncError(e));
      });
    return () => {
      current = false;
    };
    // The title is read once per load: typing in the chapter behind the dialog must not reload the list.
  }, [novelId, attempt]);

  const chosen = parts?.find((p) => p.partId === selected) ?? null;
  const linkedId = parts ? linkedPart(parts, linkedPartId)?.partId : null;
  // The link outranks the title: Same title only labels a part when the chapter has no linked part on Wattpad.
  const sameTitleId = parts && !linkedId ? sameTitlePart(parts, chapterTitle)?.partId : null;

  async function replace() {
    if (!chosen) return;
    setSyncing(true);
    setError(null);
    try {
      onSynced(await syncChapterFromWattpad(chapterId, chosen.partId));
    } catch (e) {
      // The chapter text is untouched: go back to the list with the reason.
      setError(syncError(e));
      setConfirming(false);
      setSyncing(false);
    }
  }

  if (confirming && chosen) {
    return (
      <div className="pldialog__form wattpad-sync__confirm" role="group" aria-labelledby={`${ids}-confirm`}>
        <h3 className="wattpad-sync__confirm-title" id={`${ids}-confirm`}>
          Replace this chapter's text?
        </h3>
        <p>
          Are you sure you want to replace the text of "{chapterTitle}" with "{chosen.title}" from Wattpad? Your
          current text will be lost, including any unsaved changes. The chapter title stays the same.
        </p>
        <FormActions tight>
          <button className="button" type="button" onClick={() => setConfirming(false)} disabled={syncing}>
            Cancel
          </button>
          <button className="button button--danger-solid" type="button" onClick={() => void replace()} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Replace text'}
          </button>
        </FormActions>
      </div>
    );
  }

  return (
    <div className="pldialog__form">
      {loadError && (
        <Alert title={loadError.title} hint={loadError.hint}>
          <button className="button button--s" type="button" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </Alert>
      )}
      {parts === null && !loadError && <LoadingText>Loading Wattpad chapters…</LoadingText>}
      {parts !== null && parts.length === 0 && <p className="muted">Wattpad lists no chapters for this story.</p>}
      {parts !== null && parts.length > 0 && (
        <fieldset className="wattpad-sync__parts">
          <legend className="wattpad-sync__legend">Choose the Wattpad chapter to copy the text from</legend>
          {parts.map((p) => (
            <label
              key={p.partId}
              className={`wattpad-sync__part${p.partId === selected ? ' wattpad-sync__part--selected' : ''}${p.deleted ? ' wattpad-sync__part--deleted' : ''}`}
            >
              <input
                type="radio"
                name={`${ids}-part`}
                value={p.partId}
                checked={p.partId === selected}
                disabled={p.deleted}
                onChange={() => setSelected(p.partId)}
              />
              <span className="wattpad-sync__title">{p.title}</span>
              <span className="wattpad-sync__meta">
                <span className="meta">{p.wordCount.toLocaleString('en-US')} words</span>
                {p.modifiedAt && <span className="meta">{formatInstant(p.modifiedAt)}</span>}
                {p.deleted && (
                  <span className="badge badge--progress">
                    <Trash2 className="icon icon--sm" aria-hidden="true" />
                    Deleted
                  </span>
                )}
                {p.partId === linkedId && <span className="badge badge--info">Linked</span>}
                {p.partId === sameTitleId && <span className="badge badge--info">Same title</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {error && <Alert title={error.title} hint={error.hint} />}
      <FormActions tight>
        <button className="button" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="button button--primary" type="button" disabled={!chosen} onClick={() => setConfirming(true)}>
          Sync
        </button>
      </FormActions>
    </div>
  );
}
