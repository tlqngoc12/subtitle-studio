import { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyzeNovelProfile,
  getNovelProfile,
  saveNovelProfile,
  type NovelProfileAnalysis,
  type NovelProfileDetails,
} from '../../api/novelProfile';
import { ApiError } from '../../api/client';
import type { NovelSourceType } from '../../api/novels';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { ProfileAnalyzePanel } from '../profiles/ProfileAnalyzePanel';
import { Alert } from '../ui/Alert';
import { LoadingText } from '../ui/LoadingText';
import './NovelProfileTab.css';

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Novel › Profile: the novel's translation profile, improved from the paragraphs corrected in published chapters. */
export function NovelProfileTab({ novelId, sourceType }: { novelId: number; sourceType: NovelSourceType }) {
  const [details, setDetails] = useState<NovelProfileDetails | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(() => {
    getNovelProfile(novelId)
      .then((d) => alive.current && setDetails(d))
      .catch((e) => {
        if (!alive.current) return;
        if (e instanceof ApiError && e.code === 'NO_PROFILE') setMissing(true);
        else setError(errorMessage(e));
      });
  }, [novelId]);

  useEffect(() => {
    setDetails(null);
    setMissing(false);
    setError(null);
    load();
  }, [load]);

  if (missing) {
    return (
      <Alert
        title="This novel has no translation profile."
        hint="Choose a profile in the Details tab, then come back here."
      />
    );
  }
  if (error) return <Alert title={error.title} hint={error.hint} />;
  if (!details) return <LoadingText>Loading the profile…</LoadingText>;

  const { stats } = details;
  const reason = !details.geminiConfigured
    ? 'GEMINI_API_KEY is not set'
    : stats.edits === 0
      ? 'No edited published chapters yet'
      : null;
  const others = stats.otherNovels.length > 0 ? ` · incl. chapters of ${stats.otherNovels.join(', ')}` : '';

  return (
    <ProfileAnalyzePanel<NovelProfileAnalysis>
      label="Novel translation profile"
      name={details.name}
      text={details.text}
      sha={details.sha}
      stats={`Based on ${plural(stats.chapters, 'published chapter')} · ${plural(stats.edits, 'edit')}${others}`}
      disabledReason={reason}
      analyze={() => analyzeNovelProfile(novelId)}
      save={(text, baseSha) => saveNovelProfile(novelId, text, baseSha)}
      onSaved={load}
      allowDirectEdit
      picker={() => (
        <p className="novel-profile__name">
          <span className="meta">Profile</span> <strong>{details.name}.md</strong>
        </p>
      )}
      basedOnNote={(a) =>
        a.basedOn.edits < stats.edits
          ? `Used ${a.basedOn.edits} of ${stats.edits} edits (newest first)`
          : `Based on ${plural(a.basedOn.edits, 'edit')} from ${plural(a.basedOn.chapters, 'chapter')}`
      }
      extra={(a) => (
        <>
          <h2 className="history__heading">Terms &amp; addressing ({a.terms.length})</h2>
          {a.terms.length === 0 ? (
            <p className="muted">No new terms or addressing found.</p>
          ) : (
            <ul className="profiles__rules" aria-label="Terms and addressing">
              {a.terms.map((t, i) => (
                <li key={i} className="profiles__rule">
                  <span>
                    <span className="badge badge--info">{t.kind === 'term' ? 'Term' : 'Addressing'}</span>
                    <span className="visually-hidden">: </span> {t.text}
                  </span>
                  <span className="meta">{' '}(×{t.count})</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      notice={
        stats.edits === 0 && sourceType === 'WATTPAD' ? (
          <p className="muted">Chapters translated before this update keep no AI copy and are skipped.</p>
        ) : null
      }
    />
  );
}
