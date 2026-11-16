import { Loader2, Save, Sparkles, SquarePen, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { diffBlocks, type DiffBlock } from '../../lib/profileDiff';
import { Tip } from '../Tip';
import { Alert } from '../ui/Alert';
import { Toolbar } from '../ui/Toolbar';
import { useConfirmDialog } from '../useConfirmDialog';
import './ProfileAnalyzePanel.css';

/** Unchanged runs longer than this many lines are folded behind a "… N unchanged lines" button. */
const FOLD_OVER = 6;
const DIFF_DEBOUNCE_MS = 300;

export interface PanelAnalysis {
  proposed: string;
  rules: { text: string; count: number }[];
  sha: string;
  model: string;
}

export interface ProfileAnalyzePanelProps<A extends PanelAnalysis> {
  /** The saved profile; `name` is empty while none is chosen. */
  name: string;
  text: string;
  sha: string;
  /** Shown next to the picker, e.g. "Based on 12 chapters · 48 edits". */
  stats: ReactNode;
  /** Analyze is disabled and explains itself with this text. */
  disabledReason: string | null;
  analyze: () => Promise<A>;
  save: (text: string, baseSha: string) => Promise<{ sha: string }>;
  /** Called after a successful save; the parent reloads the saved profile. */
  onSaved: () => void;
  /** Rendered before the stats in the toolbar (Vietsub's profile select); receives whether the panel is busy. */
  picker?: (locked: boolean) => ReactNode;
  /** Extra result lists under the rules, e.g. terms and addressing. */
  extra?: (analysis: A) => ReactNode;
  /** The "Based on …" line; the model is appended. */
  basedOnNote: (analysis: A) => ReactNode;
  /** Shows an Edit button that opens the saved text in the editor without running Analyze. */
  allowDirectEdit?: boolean;
  /** Content shown under the toolbar: the parent's own alerts and loading text. */
  notice?: ReactNode;
  /** Replaces the toolbar's accessible name. */
  label?: string;
}

/** Analyze corrections, review the proposal as a diff, edit it and save it: shared by Vietsub profiles and novels. */
export function ProfileAnalyzePanel<A extends PanelAnalysis>({
  name,
  text,
  sha,
  stats,
  disabledReason,
  analyze: runAnalyze,
  save: runSave,
  onSaved,
  picker,
  extra,
  basedOnNote,
  allowDirectEdit = false,
  notice,
  label = 'Translation profiles',
}: ProfileAnalyzePanelProps<A>) {
  const ids = useId();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [analysis, setAnalysis] = useState<A | null>(null);
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

  // Another profile (or none) was chosen: drop the proposal.
  useEffect(() => {
    setAnalysis(null);
    setEditing(false);
    setError(null);
  }, [name]);

  // The text shown in the diff: the proposal, or what is typed in the editor (after a short pause).
  const [shownDraft, setShownDraft] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setShownDraft(draft), DIFF_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);
  const open = analysis !== null || editing;
  const after = open ? (editing ? shownDraft : (analysis?.proposed ?? '')) : '';
  const blocks = useMemo(() => (open ? diffBlocks(text, after) : []), [open, text, after]);
  const changed = open ? after !== text : false;
  const edited = open && editing && draft !== (analysis?.proposed ?? text);

  async function analyze() {
    if (disabledReason || analyzing || open) return;
    setAnalyzing(true);
    setError(null);
    try {
      const result = await runAnalyze();
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

  function startDirectEdit() {
    setError(null);
    setAnalysis(null);
    setDraft(text);
    setShownDraft(text);
    setEditing(true);
  }

  async function cancel() {
    if (edited) {
      const ok = await confirm({
        title: 'Discard your edits?',
        description: analysis
          ? 'The proposal and your changes will be dropped. The saved profile is not touched.'
          : 'Your changes will be dropped. The saved profile is not touched.',
        confirmLabel: 'Discard',
        destructive: true,
      });
      if (!ok) return;
    }
    setAnalysis(null);
    setEditing(false);
  }

  async function save() {
    if (!open) return;
    const ok = await confirm({
      title: `Overwrite ${name}.md?`,
      description: 'The current version is backed up.',
      confirmLabel: 'Save',
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await runSave(editing ? draft : (analysis?.proposed ?? ''), sha);
      if (!alive.current) return;
      toast.success('Profile saved', { description: `${name}.md · previous version kept in history` });
      setAnalysis(null);
      setEditing(false);
      onSaved();
    } catch (e) {
      if (alive.current) setError(errorMessage(e));
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  const locked = analyzing || open || saving;
  const reasonId = `${ids}-reason`;
  return (
    <section className="profiles" aria-label={label}>
      {confirmDialog}
      <Toolbar
        className="profiles__bar"
        filters={
          <>
            {picker?.(locked)}
            {stats && <p className="profiles__stats meta">{stats}</p>}
          </>
        }
        actions={
          <>
            <Tip label={disabledReason ?? ''} disabled={!disabledReason}>
              <button
                className="button button--primary profiles__analyze"
                type="button"
                aria-disabled={disabledReason || open || analyzing ? true : undefined}
                aria-describedby={disabledReason ? reasonId : undefined}
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
            {disabledReason && (
              <span id={reasonId} className="visually-hidden">
                {disabledReason}
              </span>
            )}
            {allowDirectEdit && (
              <button className="button" type="button" onClick={startDirectEdit} disabled={locked || !name}>
                <SquarePen className="icon" aria-hidden="true" />
                Edit profile
              </button>
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

      {notice}

      {open && (
        <div className="profiles__result">
          {analysis && (
            <>
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
              {extra?.(analysis)}
              <p className="meta">
                {basedOnNote(analysis)} · model {analysis.model}
              </p>
            </>
          )}

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
              disabled={saving || !changed || (editing && draft.trim() === '')}
            >
              <Save className="icon" aria-hidden="true" />
              Save to {name}.md
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The highlighted diff: added text on a tint, removed text struck through, long unchanged runs folded. */
function DiffView({ blocks, changed }: { blocks: DiffBlock[]; changed: boolean }) {
  const [unfolded, setUnfolded] = useState<Set<number>>(new Set());
  if (!changed) {
    return <p className="muted">No changes: the proposed text is the same as the current profile.</p>;
  }
  return (
    <div className="pdiff" role="region" aria-label="Changes to the profile" tabIndex={0}>
      {blocks.map((block, i) => {
        if (block.kind === 'same') {
          const text = block.parts.map((p) => p.text).join('');
          if (block.lines > FOLD_OVER && !unfolded.has(i)) {
            return (
              <button
                key={i}
                type="button"
                className="pdiff__fold"
                onClick={() => setUnfolded((s) => new Set(s).add(i))}
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
