import { NotebookPen, RotateCcw } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { getNotebook, retryNotebook, type NotebookView as View } from '../../api/novels';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { EmptyState } from '../EmptyState';

/** The Notebook tab: the story notebook Gemini keeps after each published chapter (read only). */
export function NotebookView({
  novelId,
  view,
  onView,
}: {
  novelId: number;
  view: View | null;
  onView: (view: View) => void;
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
      <div className="alert" role="alert">
        <p className="alert__title">{error.title}</p>
        {error.hint && <p className="alert__hint">{error.hint}</p>}
      </div>
    );
  }
  if (!view) return <p className="muted">Loading notebook…</p>;

  const status = (
    <>
      {view.status === 'UPDATING' && <p className="badge badge--progress">Updating notebook…</p>}
      {view.status === 'FAILED' && (
        <div className="alert" role="alert">
          <p className="alert__title">The last notebook update failed.</p>
          {view.error && <p className="alert__hint">{view.error}</p>}
          <button className="button button--small" type="button" onClick={retry} disabled={retrying}>
            <RotateCcw className="icon" aria-hidden="true" />
            Retry notebook update
          </button>
        </div>
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
        <select
          id={`${id}-version`}
          value={view.afterChapterNo ?? ''}
          onChange={(e) => void choose(Number(e.target.value))}
        >
          {view.versions.map((v) => (
            <option key={v} value={v}>
              After chapter {v}
            </option>
          ))}
        </select>
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
              <strong>Chapter {r.chapterNo}:</strong> {r.summary}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
