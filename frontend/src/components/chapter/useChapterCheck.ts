import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ApiError } from '../../api/client';
import { getNovelProfile } from '../../api/novelProfile';
import { getChapterReview } from '../../api/novels';
import { getWritingRules } from '../../api/writingRules';
import { adaptCase, applySuggestion, findIssues, parseCheckRules, type CheckRule, type Issue } from '../../lib/checkRules';
import { findReviewIssues, parseReview, type ReviewRow } from '../../lib/reviewFile';
import { findRepeatedOpenings, findRepeatedPhrases, type RepeatGroup } from '../../lib/repetition';
import { effectiveRules, parseGlobalRules, type GlobalRules } from '../../lib/writingRules';
import { WRITING_RULES_SEED } from '../../lib/writingRulesSeed';

/** Matching re-runs this long after the last key. */
export const CHECK_DEBOUNCE_MS = 150;

type Profile = { state: 'loading' } | { state: 'none' } | { state: 'error' } | { state: 'ok'; text: string };
type Global = { state: 'loading' } | { state: 'error' } | { state: 'ok'; rules: GlobalRules };

/** One mark in the chapter: a rule hit (banned phrase, wrong form) or one occurrence of a repeat. */
export type CheckIssue = (Issue & { kind: 'rule' }) | { kind: 'repeat'; start: number; end: number; group: RepeatGroup };

const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && a.end > b.start;

/**
 * Rule hits first, then repeat occurrences, longest first; a repeat that overlaps a mark already kept is dropped
 * (the mirror behind the textarea cannot paint two marks on the same words). Sorted by `start`.
 */
function merge(ruleHits: Issue[], groups: RepeatGroup[]): CheckIssue[] {
  const kept: CheckIssue[] = ruleHits.map((i) => ({ ...i, kind: 'rule' as const }));
  const repeats = groups
    .flatMap((group) => group.ranges.map((r) => ({ kind: 'repeat' as const, start: r.start, end: r.end, group })))
    .sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  for (const r of repeats) {
    if (!kept.some((k) => overlaps(k, r))) kept.push(r);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/**
 * The Check of the chapter text, with the hits in the current text, the hit the caret is in (its popover), and
 * applying a suggestion. Translated novels use the rules of the novel's profile (`## Kiểm tra`). An original story
 * (`original`) uses the global writing rules merged with its profile, and also marks repeated phrases and sentence
 * openings. Rules are read once per visit and again each time Check is switched on. No Gemini call.
 */
export function useChapterCheck({
  novelId,
  chapterId,
  original = false,
  text,
  locked,
  textRef,
  boxRef,
  onTextChange,
}: {
  novelId: number;
  chapterId: number;
  /** The chapter belongs to an original story (sourceType ORIGINAL). */
  original?: boolean;
  text: string;
  locked: boolean;
  textRef: RefObject<HTMLTextAreaElement | null>;
  /** The Check overlay's box; the hit's mark (`[data-index]`) is what Next/Previous scroll into view. */
  boxRef?: RefObject<HTMLDivElement | null>;
  onTextChange: (text: string) => void;
}) {
  const [profile, setProfile] = useState<Profile>({ state: 'loading' });
  const [global, setGlobal] = useState<Global>({ state: 'loading' });
  const [on, setOn] = useState(false);
  const [found, setFound] = useState<{ text: string; issues: CheckIssue[] }>({ text: '', issues: [] });
  // Review mode: the rows of the review file, kept until Review is switched on again (the file is not read twice).
  const [reviewOn, setReviewOn] = useState(false);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [reviewFile, setReviewFile] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [scan, setScan] = useState<{ done: number; notFound: ReviewRow[] }>({ done: 0, notFound: [] });
  const [caret, setCaret] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    const loadProfile = async () => {
      try {
        const details = await getNovelProfile(novelId);
        if (alive.current) setProfile({ state: 'ok', text: details.text });
      } catch (e) {
        if (!alive.current) return;
        setProfile(e instanceof ApiError && (e.code === 'NO_PROFILE' || e.code === 'NO_NOVEL_PROFILE' || e.status === 404) ? { state: 'none' } : { state: 'error' });
      }
    };
    const loadGlobal = async () => {
      try {
        const rules = await getWritingRules();
        if (alive.current) setGlobal({ state: 'ok', rules: parseGlobalRules(rules ?? WRITING_RULES_SEED) });
      } catch {
        if (alive.current) setGlobal({ state: 'error' });
      }
    };
    await Promise.all([loadProfile(), original ? loadGlobal() : Promise.resolve()]);
  }, [novelId, original]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  /** What Check matches and how many rule lines could not be read. */
  const data = useMemo(() => {
    const none = { rules: [] as CheckRule[], ignored: 0, repeatIgnores: [] as string[], ready: false };
    if (original) {
      if (global.state !== 'ok' || (profile.state !== 'ok' && profile.state !== 'none')) return none;
      const eff = effectiveRules(global.rules, profile.state === 'ok' ? profile.text : null);
      return { rules: eff.checkRules, ignored: eff.ignored, repeatIgnores: eff.repeatIgnores, ready: true };
    }
    if (profile.state !== 'ok') return none;
    const parsed = parseCheckRules(profile.text);
    return { rules: parsed.rules, ignored: parsed.ignored, repeatIgnores: [] as string[], ready: parsed.rules.length > 0 };
  }, [original, global, profile]);
  const { rules, ignored, repeatIgnores } = data;
  const reviewActive = reviewOn && !locked;
  const active = reviewActive || (on && !locked && data.ready);

  useEffect(() => {
    if (!active) {
      setFound((f) => (f.text === '' && f.issues.length === 0 ? f : { text: '', issues: [] }));
      return;
    }
    const timer = window.setTimeout(() => {
      if (reviewActive) {
        const result = findReviewIssues(text, reviewRows);
        setScan({ done: result.done.length, notFound: result.notFound });
        setFound({ text, issues: result.issues.map((i) => ({ ...i, kind: 'rule' as const })) });
        return;
      }
      const groups = original ? [...findRepeatedPhrases(text, repeatIgnores), ...findRepeatedOpenings(text)] : [];
      setFound({ text, issues: merge(findIssues(text, rules), groups) });
    }, CHECK_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [active, reviewActive, reviewRows, text, rules, repeatIgnores, original]);

  /** Why Check cannot be switched on, or null. */
  const disabledReason = locked
    ? 'Check is off while the chapter is translating'
    : original && global.state === 'error'
      ? 'Could not load the writing rules'
      : profile.state === 'error'
        ? 'Could not load the profile'
        : !original && profile.state === 'none'
          ? 'This novel has no profile'
          : !original && profile.state === 'ok' && rules.length === 0
            ? 'No rules in ## Kiểm tra'
            : null;

  async function toggle() {
    if (disabledReason !== null) return;
    if (on) {
      setOn(false);
      return;
    }
    setReviewOn(false); // Check and Review exclude each other
    setReviewError(null);
    setOn(true);
    await load(); // picks up rules edited elsewhere
  }

  /** Review on: reads the newest review file every time (a newer one may have been written); off: just hides it. */
  async function toggleReview() {
    if (reviewOn) {
      setReviewOn(false);
      return;
    }
    if (locked || reviewLoading) return;
    setReviewLoading(true);
    setReviewError(null);
    try {
      const file = await getChapterReview(chapterId);
      if (!alive.current) return;
      const rows = parseReview(file.markdown);
      setReviewRows(rows);
      setReviewFile(file.fileName);
      // Show the first result at once instead of after the debounce.
      const first = findReviewIssues(text, rows);
      setScan({ done: first.done.length, notFound: first.notFound });
      setFound({ text, issues: first.issues.map((i) => ({ ...i, kind: 'rule' as const })) });
      setOn(false);
      setReviewOn(true);
    } catch (e) {
      if (alive.current) setReviewError(e instanceof ApiError ? e.detail : 'Could not load the review file');
    } finally {
      if (alive.current) setReviewLoading(false);
    }
  }
  // Hits are only trusted for the text they were found in: a half-second-old answer must not point into new text.
  const issues = useMemo(() => (active && found.text === text ? found.issues : []), [active, found, text]);
  const hitAt = (pos: number | null) =>
    pos === null ? -1 : issues.findIndex((i) => i.start <= pos && pos <= i.end);
  const index = hitAt(caret);
  const open = active && index >= 0 && dismissed !== issues[index].start;

  const updateCaret = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    const pos = el.selectionStart === el.selectionEnd ? el.selectionStart : null;
    setCaret(pos);
  }, [textRef]);

  // Esc hides the popover for that hit only; once the caret is out of it, it may open again.
  useEffect(() => {
    if (index < 0 && dismissed !== null) setDismissed(null);
  }, [index, dismissed]);

  useEffect(() => {
    const el = textRef.current;
    if (!active || !el) return;
    el.addEventListener('click', updateCaret);
    el.addEventListener('keyup', updateCaret);
    el.addEventListener('select', updateCaret);
    return () => {
      el.removeEventListener('click', updateCaret);
      el.removeEventListener('keyup', updateCaret);
      el.removeEventListener('select', updateCaret);
    };
  }, [active, textRef, updateCaret]);

  function apply(issue: Issue, suggestion: string) {
    const el = textRef.current;
    if (!el) return;
    setDismissed(null);
    el.focus();
    el.setSelectionRange(issue.start, issue.end);
    // A review passage is applied exactly as written; a check suggestion follows the capital letter of the hit.
    const replacement = reviewActive ? suggestion : adaptCase(el.value.slice(issue.start, issue.end), suggestion);
    // insertText keeps the browser's own undo (Ctrl+Z); without it the value is replaced and the page's state follows.
    const done = typeof document.execCommand === 'function' && document.execCommand('insertText', false, replacement);
    if (!done) {
      onTextChange(
        reviewActive
          ? el.value.slice(0, issue.start) + suggestion + el.value.slice(issue.end)
          : applySuggestion(el.value, issue, suggestion),
      );
      el.setSelectionRange(issue.start + replacement.length, issue.start + replacement.length);
    }
    setCaret(issue.start + replacement.length);
  }

  /** Puts the caret at `start` and brings the mark starting there (or the box) into view. */
  function moveTo(start: number) {
    const el = textRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(start, start);
    setDismissed(null);
    setCaret(start);
    // The textarea grows with its text, so centring it would miss the hit on a long chapter: centre the hit's own mark.
    const reveal = () => {
      const at = issues.findIndex((i) => i.start === start);
      const mark = at >= 0 ? boxRef?.current?.querySelector<HTMLElement>(`[data-index="${at}"]`) : null;
      (mark ?? el).scrollIntoView?.({ block: 'center' });
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(reveal);
    else reveal();
  }

  function goTo(step: 1 | -1) {
    const el = textRef.current;
    if (!el || issues.length === 0) return;
    const pos = el.selectionStart;
    const target =
      step === 1
        ? (issues.find((i) => i.start > pos) ?? issues[0])
        : ([...issues].reverse().find((i) => i.end < pos && i.start < pos) ?? issues[issues.length - 1]);
    moveTo(target.start);
  }

  /** Next/previous occurrence of the repeat the popover is about (wraps). */
  function goToInGroup(step: 1 | -1) {
    const el = textRef.current;
    const issue = open ? issues[index] : null;
    if (!el || !issue || issue.kind !== 'repeat') return;
    const starts = issue.group.ranges.map((r) => r.start);
    const pos = el.selectionStart;
    const target =
      step === 1
        ? (starts.find((s) => s > pos) ?? starts[0])
        : ([...starts].reverse().find((s) => s < pos) ?? starts[starts.length - 1]);
    moveTo(target);
  }

  // F8 / Shift+F8 step through the issues while Check is on (not while a dialog is open).
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'F8' || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      e.preventDefault();
      goToRef.current(e.shiftKey ? -1 : 1);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);

  return {
    /** Check is on (not Review). */
    on: active && !reviewActive,
    mode: (reviewActive ? 'review' : 'check') as 'check' | 'review',
    /** Marks are shown, by Check or by Review. */
    marking: active,
    requested: on,
    toggleReview,
    review: {
      on: reviewActive,
      fileName: reviewActive ? reviewFile : null,
      done: scan.done,
      notFound: scan.notFound,
      error: reviewError,
      loading: reviewLoading,
    },
    /** The novel has a profile, so a rule can be added to it. */
    hasProfile: profile.state === 'ok',
    /** Reads the rules again (after a rule was added). */
    reloadRules: load,
    toggle,
    disabledReason,
    issues,
    ignored: active && !reviewActive ? ignored : 0,
    current: open ? issues[index] : null,
    currentIndex: open ? index : -1,
    close: () => {
      if (open) setDismissed(issues[index].start);
      textRef.current?.focus();
    },
    apply,
    goTo,
    goToInGroup,
    marks: useMemo(
      () => issues.map((i) => ({ start: i.start, end: i.end, className: i.kind === 'repeat' ? 'check-repeat' : undefined })),
      [issues],
    ),
  };
}
