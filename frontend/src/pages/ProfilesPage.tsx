import { Loader2, Save, Sparkles, SquarePen, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { getPromptProfiles, type PromptProfiles } from '../api/client';
import {
  analyzeProfile,
  getProfileDetails,
  saveProfile,
  type ProfileAnalysis,
  type ProfileDetails,
} from '../api/promptProfiles';
import { Tip } from '../components/Tip';
import { Alert } from '../components/ui/Alert';
import { LoadingText } from '../components/ui/LoadingText';
import { Page } from '../components/ui/Page';
import { PageHeader } from '../components/ui/PageHeader';
import { Select } from '../components/ui/Select';
import { Toolbar } from '../components/ui/Toolbar';
import { useConfirmDialog } from '../components/useConfirmDialog';
import { VietsubTabs } from '../components/VietsubTabs';
import { errorMessage, type ErrorMessage } from '../lib/errors';
import { diffBlocks, type DiffBlock } from '../lib/profileDiff';
import './ProfilesPage.css';

/** Unchanged runs longer than this many lines are folded behind a "… N unchanged lines" button. */
const FOLD_OVER = 6;
const DIFF_DEBOUNCE_MS = 300;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Vietsub › Profiles: let Gemini propose a better translation profile from the lines the translator corrected. */
export default function ProfilesPage() {
  const ids = useId();
  const [params, setParams] = useSearchParams();
  const selected = params.get('profile') ?? '';
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const [profiles, setProfiles] = useState<PromptProfiles | null>(null);
  const [details, setDetails] = useState<ProfileDetails | null>(null);
  const [analysis, setAnalysis] = useState<ProfileAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<ErrorMessage | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    getPromptProfiles()
      .then(setProfiles)
      .catch((e) => {
        setProfiles({ configured: false, profiles: [] });
        setError(errorMessage(e));
      });
  }, []);

  function loadDetails(name: string) {
    getProfileDetails(name)
      .then((d) => alive.current && setDetails(d))
      .catch((e) => alive.current && setError(errorMessage(e)));
  }

  useEffect(() => {
    setDetails(null);
    setAnalysis(null);
    setEditing(false);
    if (selected) loadDetails(selected);
  }, [selected]);

  // The text shown in the diff: the proposal, or what is typed in the editor (after a short pause).
  const [shownDraft, setShownDraft] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setShownDraft(draft), DIFF_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);
  const after = analysis ? (editing ? shownDraft : analysis.proposed) : '';
  const blocks = useMemo(
    () => (analysis && details ? diffBlocks(details.text, after) : []),
    [analysis, details, after],
  );
  const changed = analysis && details ? after !== details.text : false;
  const edited = analysis !== null && editing && draft !== analysis.proposed;

  const reason = !selected
    ? 'Choose a profile first'
    : !details
      ? 'Loading the profile…'
      : !profiles?.configured
        ? 'GEMINI_API_KEY is not set'
        : details.stats.correctedLines === 0
          ? 'No corrected lines yet'
          : null;

  async function analyze() {
    if (reason || analyzing) return;
    setAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeProfile(selected);
      if (!alive.current) return;
      setAnalysis(result);
      setDraft(result.proposed);
      setShownDraft(result.proposed);
      setEditing(false);
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      if (alive.current) setAnalyzing(false);
    }
  }

  async function cancel() {
    if (edited) {
      const ok = await confirm({
        title: 'Discard your edits?',
        description: 'The proposal and your changes will be dropped. The saved profile is not touched.',
        confirmLabel: 'Discard',
        destructive: true,
      });
      if (!ok) return;
    }
    setAnalysis(null);
    setEditing(false);
  }

  async function save() {
    if (!analysis || !details) return;
    const ok = await confirm({
      title: `Overwrite ${details.name}.md?`,
      description: 'The current version is backed up.',
      confirmLabel: 'Save',
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await saveProfile(details.name, editing ? draft : analysis.proposed, details.sha);
      if (!alive.current) return;
      toast.success(`Saved ${details.name}.md (backup kept)`);
      setAnalysis(null);
      setEditing(false);
      loadDetails(details.name);
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  const locked = analyzing || analysis !== null || saving;
  const reasonId = `${ids}-reason`;
  return (
    <Page>
      {confirmDialog}
      <PageHeader title="Vietsub" lede="Improve a translation profile from the lines you corrected." />
      <VietsubTabs>
        <section className="profiles" aria-label="Translation profiles">
          <Toolbar
            className="profiles__bar"
            filters={
              <>
                <div className="field profiles__select">
                  <label htmlFor={`${ids}-profile`}>Profile</label>
                  <Select
                    id={`${ids}-profile`}
                    value={selected}
                    disabled={locked || profiles === null}
                    onChange={(name) => {
                      setError(null);
                      setParams(name ? { profile: name } : {}, { replace: true });
                    }}
                    options={[
                      { value: '', label: 'Choose a profile…' },
                      ...(profiles?.profiles ?? []).map((name) => ({ value: name, label: name })),
                    ]}
                  />
                </div>
                {details && (
                  <p className="profiles__stats meta">
                    {plural(details.stats.videos, 'video')} · {plural(details.stats.correctedLines, 'corrected line')}
                  </p>
                )}
              </>
            }
            actions={
              <>
                <Tip label={reason ?? ''} disabled={!reason}>
                  <button
                    className="button button--primary profiles__analyze"
                    type="button"
                    aria-disabled={reason || analysis || analyzing ? true : undefined}
                    aria-describedby={reason ? reasonId : undefined}
                    onClick={analyze}
                  >
                    {analyzing ? (
                      <Loader2 className="icon icon--spin" aria-hidden="true" />
                    ) : (
                      <Sparkles className="icon" aria-hidden="true" />
                    )}
                    {analyzing ? 'Analyzing…' : 'Analyze corrections'}
                  </button>
                </Tip>
                {reason && (
                  <span id={reasonId} className="visually-hidden">
                    {reason}
                  </span>
                )}
              </>
            }
          />

          {analyzing && (
            <p className="profiles__wait muted" role="status">
              This can take up to a minute.
            </p>
          )}

          {error && <Alert title={error.title} hint={error.hint} />}

          {profiles === null && <LoadingText>Loading profiles…</LoadingText>}
          {profiles !== null && profiles.profiles.length === 0 && !error && (
            <p className="muted">No profiles yet. Add a .md file to ./data/prompts.</p>
          )}

          {analysis && details && (
            <div className="profiles__result">
              <h2 className="history__heading">Rules found</h2>
              {analysis.rules.length === 0 ? (
                <p className="muted">Gemini found no new rules; the text below may still differ.</p>
              ) : (
                <ul className="profiles__rules" aria-label="Rules found">
                  {analysis.rules.map((rule, i) => (
                    <li key={i} className="profiles__rule">
                      <span>{rule.text}</span>
                      <span className="badge badge--info">×{rule.count}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="meta">
                Based on {plural(analysis.basedOn.lines, 'line')} from {plural(analysis.basedOn.videos, 'video')} ·
                model {analysis.model}
              </p>

              <h2 className="history__heading">Changes</h2>
              {editing && (
                <div className="field">
                  <label htmlFor={`${ids}-draft`}>Profile text</label>
                  <textarea
                    id={`${ids}-draft`}
                    className="profiles__draft"
                    value={draft}
                    rows={14}
                    spellCheck={false}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                </div>
              )}
              <DiffView blocks={blocks} changed={changed} />

              <div className="profiles__actions">
                {!editing && (
                  <button className="button" type="button" onClick={() => setEditing(true)}>
                    <SquarePen className="icon" aria-hidden="true" />
                    Edit before saving
                  </button>
                )}
                <button className="button" type="button" onClick={cancel} disabled={saving}>
                  <X className="icon" aria-hidden="true" />
                  Cancel
                </button>
                <button
                  className="button button--primary"
                  type="button"
                  onClick={save}
                  disabled={saving || !changed || draft.trim() === ''}
                >
                  <Save className="icon" aria-hidden="true" />
                  Save to {details.name}.md
                </button>
              </div>
            </div>
          )}
        </section>
      </VietsubTabs>
    </Page>
  );
}

/** The highlighted diff: added text on an orange tint, removed text struck through, long unchanged runs folded. */
function DiffView({ blocks, changed }: { blocks: DiffBlock[]; changed: boolean }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  if (!changed) {
    return <p className="muted">No changes: the proposed text is the same as the current profile.</p>;
  }
  return (
    <div className="pdiff" role="region" aria-label="Changes to the profile" tabIndex={0}>
      {blocks.map((block, i) => {
        if (block.kind === 'same') {
          const text = block.parts.map((p) => p.text).join('');
          if (block.lines > FOLD_OVER && !open.has(i)) {
            return (
              <button
                key={i}
                type="button"
                className="pdiff__fold"
                onClick={() => setOpen((s) => new Set(s).add(i))}
              >
                … {block.lines} unchanged lines
              </button>
            );
          }
          return (
            <div key={i} className="pdiff__block pdiff__block--same">
              {text}
            </div>
          );
        }
        const content = (
          <>
            <span className="visually-hidden">{block.kind === 'added' ? 'Added: ' : 'Removed: '}</span>
            {block.parts.map((part, j) =>
              part.changed ? (
                <strong key={j} className="pdiff__word">
                  {part.text}
                </strong>
              ) : (
                part.text
              ),
            )}
          </>
        );
        return (
          <div key={i} className={`pdiff__block pdiff__block--${block.kind}`}>
            {block.kind === 'added' ? <ins>{content}</ins> : <del>{content}</del>}
          </div>
        );
      })}
    </div>
  );
}
