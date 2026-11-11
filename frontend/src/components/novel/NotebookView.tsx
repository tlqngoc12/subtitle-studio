import { NotebookPen, RotateCcw } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { getNotebook, retryNotebook, type NotebookView as View } from '../../api/novels';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { EmptyState } from '../EmptyState';
import { chapterName } from './ChapterList';
import { Alert } from '../ui/Alert';
import { Select } from '../ui/Select';
import { LoadingText } from '../ui/LoadingText';
import './NotebookView.css';

/** The Notebook tab: the story notebook Gemini keeps after each published chapter (read only). */
export function NotebookView({
  novelId,
  view,
  onView,
  labels = {},
}: {
  novelId: number;
  view: View | null;
  onView: (view: View) => void;
  /** Chapter labels by chapter number, so "Recent chapters" names them like the chapter list. */
  labels?: Record<number, string | null>;
}) {
  const id = useId();
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [retrying, setRetrying] = useState(false);

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

  if (error) {
    return (
      <Alert title={error.title} hint={error.hint} />
    );
  }
  if (!view) return <LoadingText>Loading notebook…</LoadingText>;

  const status = (
    <>
      {view.status === 'UPDATING' && <p className="badge badge--progress">Updating notebook…</p>}
      {view.status === 'FAILED' && (
        <Alert title="The last notebook update failed." hint={view.error}>
          <button className="button button--s" type="button" onClick={retry} disabled={retrying}>
            <RotateCcw className="icon" aria-hidden="true" />
            Retry notebook update
          </button>
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
