import { LoaderCircle, NotebookPen, RefreshCw, RotateCcw } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { getNotebook, retryNotebook, setNotebookPaused, type NotebookView as View } from '../../api/novels';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { EmptyState } from '../EmptyState';
import { Tip } from '../Tip';
import { chapterName } from './ChapterList';
import { Alert } from '../ui/Alert';
import { Select } from '../ui/Select';
import { LoadingText } from '../ui/LoadingText';
import './NotebookView.css';

/** The Notebook tab: the story notebook Gemini keeps after each published chapter, and the pause switch. */
export function NotebookView({
  novelId,
  view,
  onView,
  labels = {},
  latestPublishedNo = null,
}: {
  novelId: number;
  view: View | null;
  onView: (view: View) => void;
  /** Chapter labels by chapter number, so "Recent chapters" names them like the chapter list. */
  labels?: Record<number, string | null>;
  /** The highest Published chapter number; with it the tab can say how far behind the notebook is. */
  latestPublishedNo?: number | null;
}) {
  const id = useId();
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [savingPause, setSavingPause] = useState(false);

  useEffect(() => {
    if (view) return;
    getNotebook(novelId)
      .then(onView)
      .catch((e) => setError(errorMessage(e)));
  }, [novelId, view, onView]);

  async function choose(after: number) {
    setError(null);
    try {
      onView(await getNotebook(novelId, after));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function retry() {
    if (!view) return;
    setRetrying(true);
    setError(null);
    try {
      await retryNotebook(novelId);
      onView({ ...view, status: 'UPDATING', error: null });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRetrying(false);
    }
  }

  /** Optimistic: the switch moves at once and moves back, with a toast, when the server refuses. */
  async function togglePause(paused: boolean) {
    if (!view) return;
    const before = view;
    setSavingPause(true);
    onView({ ...view, notebookPaused: paused });
    try {
      const saved = await setNotebookPaused(novelId, paused);
      onView({ ...before, notebookPaused: saved.notebookPaused });
    } catch (e) {
      onView(before);
      toast.error(errorMessage(e).title);
    } finally {
      setSavingPause(false);
    }
  }

  if (error) {
    return (
      <Alert title={error.title} hint={error.hint} />
    );
  }
  if (!view) return <LoadingText>Loading notebook…</LoadingText>;

  const paused = view.notebookPaused;
  const lastUpdated = view.versions.length > 0 ? Math.max(...view.versions) : null;
  const behind =
    !paused && view.status === 'IDLE' && lastUpdated !== null && latestPublishedNo !== null && latestPublishedNo > lastUpdated;

  const pause = (
    <div className="notebook__pause">
      <label className="notebook__switch">
        <input
          type="checkbox"
          role="switch"
          checked={paused}
          disabled={savingPause}
          aria-describedby={`${id}-pause-hint`}
          onChange={(e) => void togglePause(e.target.checked)}
        />
        <span>Pause notebook updates</span>
      </label>
      <p id={`${id}-pause-hint`} className="muted notebook__hint">
        Publishing will not update the notebook. Translations use the notebook as it is now.
      </p>
      {behind && (
        <div className="notebook__behind">
          <p>
            The notebook was last updated after chapter {lastUpdated}; {latestPublishedNo === lastUpdated + 1
              ? `chapter ${latestPublishedNo} was`
              : `chapters ${lastUpdated + 1}–${latestPublishedNo} were`}{' '}
            published since.
          </p>
          <button className="button button--s" type="button" onClick={retry} disabled={retrying}>
            <RefreshCw className="icon" aria-hidden="true" />
            Update now
          </button>
        </div>
      )}
    </div>
  );

  const status = (
    <>
      {pause}
      {view.status === 'UPDATING' && (
        <p className="badge badge--progress">
          <LoaderCircle className="icon icon--sm" aria-hidden="true" />
          Updating notebook…
        </p>
      )}
      {view.status === 'FAILED' && (
        <Alert title="The last notebook update failed." hint={view.error}>
          <Tip label="Notebook updates are paused" disabled={!paused}>
            <span className="notebook__retry">
              <button className="button button--s" type="button" onClick={retry} disabled={retrying || paused}>
                <RotateCcw className="icon" aria-hidden="true" />
                Retry notebook update
              </button>
            </span>
          </Tip>
        </Alert>
      )}
    </>
  );

  if (!view.content) {
    return (
      <>
        {status}
        <EmptyState icon={NotebookPen}>The notebook fills in after you publish the first chapter.</EmptyState>
      </>
    );
  }
  const c = view.content;
  return (
    <div className="notebook">
      {status}
      <div className="field notebook__version">
        <label htmlFor={`${id}-version`}>Version</label>
        <Select
          id={`${id}-version`}
          value={view.afterChapterNo === null ? '' : String(view.afterChapterNo)}
          onChange={(v) => void choose(Number(v))}
          options={view.versions.map((v) => ({ value: String(v), label: `After chapter ${v}` }))}
        />
      </div>
      {view.staleLaterVersions && (
        <p className="notebook__warning">
          Notebook versions after chapter {view.afterChapterNo} were built from an older text.
        </p>
      )}

      <section className="notebook__section" aria-labelledby={`${id}-characters`}>
        <h3 id={`${id}-characters`}>Characters</h3>
        {c.characters.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <dl className="notebook__list">
            {c.characters.map((ch) => (
              <div key={ch.name} className="notebook__entry">
                <dt>
                  {ch.name}
                  {ch.sourceName && <span className="muted"> ({ch.sourceName})</span>}
                </dt>
                {ch.profile && <dd>{ch.profile}</dd>}
                {ch.currentState && (
                  <dd>
                    <span className="notebook__now">Now: </span>
                    <span>{ch.currentState}</span>
                  </dd>
                )}
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="notebook__section" aria-labelledby={`${id}-glossary`}>
        <h3 id={`${id}-glossary`}>Glossary &amp; addressing</h3>
        <ul className="notebook__plain">
          {c.addressing.map((a) => (
            <li key={`${a.from}→${a.to}`}>
              <strong>
                {a.from} → {a.to}:
              </strong>{' '}
              <span>{a.rule}</span>
            </li>
          ))}
          {c.glossary.map((g) => (
            <li key={g.source}>
              <strong>{g.source}</strong> → {g.target}
              {g.note && <span className="muted"> ({g.note})</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="notebook__section" aria-labelledby={`${id}-story`}>
        <h3 id={`${id}-story`}>Story so far</h3>
        <p>{c.storySoFar}</p>
      </section>

      <section className="notebook__section" aria-labelledby={`${id}-recent`}>
        <h3 id={`${id}-recent`}>Recent chapters</h3>
        <ul className="notebook__plain">
          {c.recentChapters.map((r) => (
            <li key={r.chapterNo}>
              <strong>{chapterName(r.chapterNo, labels[r.chapterNo])}:</strong> {r.summary}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
