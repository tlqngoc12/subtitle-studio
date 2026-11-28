import * as Dialog from '@radix-ui/react-dialog';
import { FilePlus, Lock, PencilLine, RefreshCw, Trash2, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  getWattpadSyncPlan,
  syncNovelFromWattpad,
  type WattpadSyncPart,
  type WattpadSyncPlan,
  type WattpadSyncResult,
  type WattpadSyncStatus,
} from '../../api/novels';
import { formatInstantWithTime } from '../../lib/dates';
import { errorMessage, syncFailureReason, type ErrorMessage } from '../../lib/errors';
import { toastError } from '../../lib/toast';
import { Alert } from '../ui/Alert';
import { FormActions } from '../ui/FormActions';
import { IconButton } from '../ui/IconButton';
import { LoadingText } from '../ui/LoadingText';
import '../CreatePlaylistDialog.css';
import '../chapter/WattpadSyncDialog.css';
import './WattpadSyncAllDialog.css';

/** Parts the user may tick: the others are only shown. */
export function selectable(status: WattpadSyncStatus): boolean {
  return status !== 'DELETED' && status !== 'PUBLISHED' && status !== 'UP_TO_DATE';
}

/** What is ticked when the list opens: parts with a newer Wattpad version and parts that are new. */
export function defaultSelection(parts: WattpadSyncPart[]): Set<string> {
  return new Set(parts.filter((p) => p.status === 'UPDATED' || p.status === 'NEW_PART').map((p) => p.partId));
}

const BADGES: Record<WattpadSyncStatus, { label: string; className: string; icon: LucideIcon } | null> = {
  UPDATED: { label: 'Updated on Wattpad', className: 'badge badge--progress', icon: RefreshCw },
  NEW_PART: { label: 'New', className: 'badge badge--done', icon: FilePlus },
  LOCAL_EDITS: { label: 'Edited in the app', className: 'badge badge--warn', icon: PencilLine },
  NOT_SYNCED: { label: 'Never synced', className: 'badge badge--warn', icon: TriangleAlert },
  PUBLISHED: { label: 'Published', className: 'badge badge--muted', icon: Lock },
  DELETED: { label: 'Deleted on Wattpad', className: 'badge badge--muted', icon: Trash2 },
  UP_TO_DATE: null,
};

/** The warning under a part that needs the user's attention before it is ticked. */
const WARNINGS: Partial<Record<WattpadSyncStatus, string>> = {
  LOCAL_EDITS: 'Edited in the app since the last sync',
  NOT_SYNCED: "Never synced: the app's text will be replaced",
  PUBLISHED: 'Unpublish to sync',
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The confirmation text for the ticked parts; `risky` counts the ones edited in the app or never synced. */
export function confirmCopy(replaced: number, added: number, risky: number): { title: string; body: string } {
  const total = replaced + added;
  const sentences: string[] = [];
  if (replaced > 0 && added > 0) {
    sentences.push(
      `The text of ${plural(replaced, 'chapter')} will be replaced by their Wattpad version and ${plural(added, 'new chapter')} will be added.`,
    );
  } else if (replaced > 0) {
    sentences.push(`The text of ${plural(replaced, 'chapter')} will be replaced by their Wattpad version.`);
  } else {
    sentences.push(`${plural(added, 'new chapter')} will be added.`);
  }
  if (replaced > 0) sentences.push('Replaced text cannot be restored.');
  sentences.push('Chapter titles stay the same.');
  if (risky > 0) sentences.push(`${risky} of them ${risky === 1 ? 'was' : 'were'} edited in the app or never synced.`);
  return { title: `Sync ${plural(total, 'chapter')} from Wattpad?`, body: sentences.join(' ') };
}

/**
 * "Sync with Wattpad" for a whole original story: asks the server what changed (one request to Wattpad), lists the
 * parts to sync, confirms once, then syncs the ticked ones. Its content is mounted only while open.
 */
export function WattpadSyncAllDialog({
  open,
  onOpenChange,
  novelId,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  novelId: number;
  /** Called after a sync that changed (or tried to change) chapters, so the page reloads its chapter list. */
  onChanged: () => void;
}) {
  // While the batch runs the dialog cannot be closed.
  const [running, setRunning] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (running ? undefined : onOpenChange(next))}>
      <Dialog.Portal>
        <Dialog.Overlay className="pldialog__overlay" />
        <Dialog.Content className="pldialog wattpad-sync" aria-describedby={undefined}>
          <div className="pldialog__head">
            <Dialog.Title className="pldialog__title">Sync with Wattpad</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={X} disabled={running} />
            </Dialog.Close>
          </div>
          <SyncAllBody
            novelId={novelId}
            running={running}
            setRunning={setRunning}
            onClose={() => onOpenChange(false)}
            onChanged={onChanged}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SyncAllBody({
  novelId,
  running,
  setRunning,
  onClose,
  onChanged,
}: {
  novelId: number;
  running: boolean;
  setRunning: (running: boolean) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const ids = useId();
  const [plan, setPlan] = useState<WattpadSyncPlan | null>(null);
  const [loadError, setLoadError] = useState<ErrorMessage | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [result, setResult] = useState<WattpadSyncResult | null>(null);

  // One request to Wattpad per opening (and per Retry); the plan is never polled.
  useEffect(() => {
    let current = true;
    setPlan(null);
    setLoadError(null);
    getWattpadSyncPlan(novelId)
      .then((loaded) => {
        if (!current) return;
        setPlan(loaded);
        setSelected(defaultSelection(loaded.parts));
      })
      .catch((e) => {
        if (current) setLoadError(errorMessage(e));
      });
    return () => {
      current = false;
    };
  }, [novelId, attempt]);

  const chosen = useMemo(() => (plan ? plan.parts.filter((p) => selected.has(p.partId)) : []), [plan, selected]);
  const replaced = chosen.filter((p) => p.chapterId !== null).length;
  const added = chosen.length - replaced;
  const risky = chosen.filter((p) => p.status === 'LOCAL_EDITS' || p.status === 'NOT_SYNCED').length;

  function toggle(partId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });
  }

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const done = await syncNovelFromWattpad(
        novelId,
        chosen.map((p) => ({ partId: p.partId, chapterId: p.chapterId })),
      );
      onChanged();
      if (done.synced + done.created > 0 || done.failed.length === 0) {
        // Repo toast format: a short title, the specifics in the description.
        toast.success('Synced with Wattpad', { description: `Synced ${done.synced}, added ${done.created}` });
      }
      if (done.failed.length === 0) {
        setRunning(false);
        onClose();
        return;
      }
      toastError({ title: `${plural(done.failed.length, 'chapter')} could not be synced` });
      setResult(done);
    } catch (e) {
      // Nothing is known to have changed: back to the list with the reason.
      setError(errorMessage(e));
      setConfirming(false);
    }
    setRunning(false);
  }

  if (loadError) {
    return (
      <div className="pldialog__form">
        <Alert title={loadError.title} hint={loadError.hint}>
          <button className="button button--s" type="button" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </Alert>
        <FormActions tight>
          <button className="button" type="button" onClick={onClose}>
            Close
          </button>
        </FormActions>
      </div>
    );
  }
  if (plan === null) {
    return (
      <div className="pldialog__form">
        <LoadingText>Checking Wattpad…</LoadingText>
      </div>
    );
  }

  if (result) {
    return (
      <div className="pldialog__form">
        <Alert title={`${plural(result.failed.length, 'chapter')} could not be synced`}>
          <ul className="sync-all__failures">
            {result.failed.map((f) => (
              <li key={f.partId}>
                <strong>{f.title}</strong>: {syncFailureReason(f.code, f.message)}
              </li>
            ))}
          </ul>
        </Alert>
        <FormActions tight>
          <button className="button button--primary" type="button" onClick={onClose}>
            Close
          </button>
        </FormActions>
      </div>
    );
  }

  if (running) {
    return (
      <div className="pldialog__form">
        <LoadingText>Syncing…</LoadingText>
      </div>
    );
  }

  if (confirming) {
    const copy = confirmCopy(replaced, added, risky);
    return (
      <div className="pldialog__form wattpad-sync__confirm" role="group" aria-labelledby={`${ids}-confirm`}>
        <h3 className="wattpad-sync__confirm-title" id={`${ids}-confirm`}>
          {copy.title}
        </h3>
        <p>{copy.body}</p>
        <FormActions tight>
          <button className="button" type="button" onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button
            className={risky > 0 ? 'button button--danger-solid' : 'button button--primary'}
            type="button"
            onClick={() => void run()}
          >
            Sync
          </button>
        </FormActions>
      </div>
    );
  }

  const nothingToDo = !plan.parts.some((p) => selectable(p.status));
  return (
    <div className="pldialog__form">
      {nothingToDo && <p>Everything is up to date with Wattpad.</p>}
      {plan.parts.length > 0 && (
        <fieldset className="wattpad-sync__parts">
          <legend className="wattpad-sync__legend">
            {nothingToDo ? 'Not synced' : 'Choose the Wattpad chapters to sync'}
          </legend>
          {plan.parts.map((p) => (
            <PartRow key={p.partId} part={p} checked={selected.has(p.partId)} onToggle={() => toggle(p.partId)} />
          ))}
        </fieldset>
      )}
      {plan.upToDate > 0 && <p className="muted">{plural(plan.upToDate, 'chapter')} up to date</p>}
      {error && <Alert title={error.title} hint={error.hint} />}
      <FormActions tight>
        <button className="button" type="button" onClick={onClose}>
          {nothingToDo ? 'Close' : 'Cancel'}
        </button>
        {!nothingToDo && (
          <button
            className="button button--primary"
            type="button"
            disabled={chosen.length === 0}
            onClick={() => setConfirming(true)}
          >
            {chosen.length > 0 ? `Sync ${chosen.length}` : 'Sync'}
          </button>
        )}
      </FormActions>
    </div>
  );
}

function PartRow({ part: p, checked, onToggle }: { part: WattpadSyncPart; checked: boolean; onToggle: () => void }) {
  const canTick = selectable(p.status);
  const badge = BADGES[p.status];
  const warning = WARNINGS[p.status];
  const className = ['wattpad-sync__part', checked ? 'wattpad-sync__part--selected' : '', canTick ? '' : 'wattpad-sync__part--deleted']
    .filter(Boolean)
    .join(' ');
  return (
    <label className={className}>
      <input type="checkbox" checked={checked} disabled={!canTick} onChange={onToggle} />
      <span className="wattpad-sync__title">{p.title}</span>
      <span className="wattpad-sync__meta">
        {p.modifiedAt && <span className="meta">{formatInstantWithTime(p.modifiedAt)}</span>}
        <span className="meta sync-all__target">{p.chapterTitle ? `→ ${p.chapterTitle}` : 'New chapter'}</span>
        {badge && (
          <span className={badge.className}>
            <badge.icon className="icon icon--sm" aria-hidden="true" />
            {badge.label}
          </span>
        )}
        {warning && <span className="sync-all__warning">{warning}</span>}
      </span>
    </label>
  );
}
