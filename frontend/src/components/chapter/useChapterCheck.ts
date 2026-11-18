import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ApiError } from '../../api/client';
import { getNovelProfile } from '../../api/novelProfile';
import { adaptCase, applySuggestion, findIssues, parseCheckRules, type CheckRules, type Issue } from '../../lib/checkRules';

/** Matching re-runs this long after the last key. */
export const CHECK_DEBOUNCE_MS = 150;

type Profile = { state: 'loading' } | { state: 'none' } | { state: 'error' } | { state: 'ok'; rules: CheckRules };

/**
 * The Check of the chapter text: the rules of the novel's profile (`## Kiểm tra`), the hits in the current text, the
 * hit the caret is in (its popover), and applying a suggestion. The profile is read once per visit and again each
 * time Check is switched on, so a rule edited in the Profile tab is picked up. No Gemini call.
 */
export function useChapterCheck({
  novelId,
  text,
  locked,
  textRef,
  boxRef,
  onTextChange,
}: {
  novelId: number;
  text: string;
  locked: boolean;
  textRef: RefObject<HTMLTextAreaElement | null>;
  /** The Check overlay's box; the hit's mark (`[data-index]`) is what Next/Previous scroll into view. */
  boxRef?: RefObject<HTMLDivElement | null>;
  onTextChange: (text: string) => void;
}) {
  const [profile, setProfile] = useState<Profile>({ state: 'loading' });
  const [on, setOn] = useState(false);
  const [found, setFound] = useState<{ text: string; issues: Issue[] }>({ text: '', issues: [] });
  const [caret, setCaret] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const details = await getNovelProfile(novelId);
      if (alive.current) setProfile({ state: 'ok', rules: parseCheckRules(details.text) });
    } catch (e) {
      if (!alive.current) return;
      setProfile(e instanceof ApiError && (e.code === 'NO_PROFILE' || e.code === 'NO_NOVEL_PROFILE' || e.status === 404) ? { state: 'none' } : { state: 'error' });
    }
  }, [novelId]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  const rules = useMemo(() => (profile.state === 'ok' ? profile.rules.rules : []), [profile]);
  const ignored = profile.state === 'ok' ? profile.rules.ignored : 0;
  const active = on && !locked && rules.length > 0;

  useEffect(() => {
    if (!active) {
      setFound((f) => (f.text === '' && f.issues.length === 0 ? f : { text: '', issues: [] }));
      return;
    }
    const timer = window.setTimeout(() => setFound({ text, issues: findIssues(text, rules) }), CHECK_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [active, text, rules]);

  /** Why Check cannot be switched on, or null. */
  const disabledReason = locked
    ? 'Check is off while the chapter is translating'
    : profile.state === 'none'
      ? 'This novel has no profile'
      : profile.state === 'error'
        ? 'Could not load the profile'
        : profile.state === 'ok' && rules.length === 0
          ? 'No rules in ## Kiểm tra'
          : null;

  async function toggle() {
    if (disabledReason !== null) return;
    if (on) {
      setOn(false);
      return;
    }
    setOn(true);
    await load(); // picks up rules edited elsewhere
  }

  // Hits are only trusted for the text they were found in: a half-second-old answer must not point into new text.
  const issues = active && found.text === text ? found.issues : [];
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
    const replacement = adaptCase(el.value.slice(issue.start, issue.end), suggestion);
    // insertText keeps the browser's own undo (Ctrl+Z); without it the value is replaced and the page's state follows.
    const done = typeof document.execCommand === 'function' && document.execCommand('insertText', false, replacement);
    if (!done) {
      onTextChange(applySuggestion(el.value, issue, suggestion));
      el.setSelectionRange(issue.start + replacement.length, issue.start + replacement.length);
    }
    setCaret(issue.start + replacement.length);
  }

  function goTo(step: 1 | -1) {
    const el = textRef.current;
    if (!el || issues.length === 0) return;
    const pos = el.selectionStart;
    const target =
      step === 1
        ? (issues.find((i) => i.start > pos) ?? issues[0])
        : ([...issues].reverse().find((i) => i.end < pos && i.start < pos) ?? issues[issues.length - 1]);
    el.focus();
    el.setSelectionRange(target.start, target.start);
    setDismissed(null);
    setCaret(target.start);
    // The textarea grows with its text, so centring it would miss the hit on a long chapter: centre the hit's own mark.
    const reveal = () => {
      const mark = boxRef?.current?.querySelector<HTMLElement>(`[data-index="${issues.indexOf(target)}"]`);
      (mark ?? el).scrollIntoView?.({ block: 'center' });
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(reveal);
    else reveal();
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
    on: active,
    requested: on,
    /** The novel has a profile, so a rule can be added to it. */
    hasProfile: profile.state === 'ok',
    /** Reads the profile's rules again (after a rule was added). */
    reloadRules: load,
    toggle,
    disabledReason,
    issues,
    ignored: active ? ignored : 0,
    current: open ? issues[index] : null,
    currentIndex: open ? index : -1,
    close: () => {
      if (open) setDismissed(issues[index].start);
      textRef.current?.focus();
    },
    apply,
    goTo,
    marks: useMemo(() => issues.map((i) => ({ start: i.start, end: i.end })), [issues]),
  };
}
