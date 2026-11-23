import * as Popover from '@radix-ui/react-popover';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, type RefObject } from 'react';
import { IconButton } from '../ui/IconButton';
import { adaptCase, type Issue } from '../../lib/checkRules';
import { PopoverPanel } from '../ui/PopoverPanel';
import type { CheckIssue } from './useChapterCheck';
import './Check.css';

/**
 * What the caret is on: the reason (muted) and one chip per suggestion, under the underlined words. Focus stays in
 * the text box, so typing goes on; Tab moves to the chips. A chip is applied by a double-click or Enter, never by a
 * single click, so it cannot happen by accident. Esc closes it.
 */
export function CheckPopover({
  issue,
  matched,
  anchor,
  onApply,
  onStep,
  onClose,
  exact = false,
  matches = 1,
}: {
  issue: CheckIssue | null;
  /** The text of the hit as written in the chapter (the suggestions follow its capital letter). */
  matched: string;
  /** The underlined mark the popover hangs under. */
  anchor: () => HTMLElement | null;
  onApply: (issue: Issue, suggestion: string) => void;
  /** Jumps to the next or previous occurrence of the repeat shown (repeat issues only). */
  onStep?: (step: 1 | -1) => void;
  onClose: () => void;
  /** Review mode: the suggestion is applied as written, so it is shown as written (no capital-letter change). */
  exact?: boolean;
  /** How many places the same passage stands in the chapter (review mode). */
  matches?: number;
}) {
  const first = useRef<HTMLButtonElement>(null);
  const virtual = useRef({ getBoundingClientRect: () => (anchor() ?? document.body).getBoundingClientRect() });
  virtual.current.getBoundingClientRect = () => (anchor() ?? document.body).getBoundingClientRect();
  return (
    <Popover.Root open={issue !== null}>
      <Popover.Anchor virtualRef={virtual} />
      {issue && (
        <PopoverPanel
          className={exact ? 'check-popover check-popover--review' : 'check-popover'}
          role="dialog"
          aria-label="Check suggestion"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            onClose();
          }}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {issue.kind === 'repeat' ? (
            <div className="check-popover__repeat">
              <p className="check-popover__wrong">
                {issue.group.type === 'phrase' ? (
                  <>
                    Repeated {issue.group.ranges.length}× — <strong>&quot;{issue.group.label}&quot;</strong>
                  </>
                ) : (
                  <>
                    {issue.group.ranges.length} sentences in a row start with <strong>&quot;{issue.group.label}&quot;</strong>
                  </>
                )}
              </p>
              <div className="check-popover__steps">
                <IconButton label="Previous occurrence" icon={ChevronLeft} size="s" onClick={() => onStep?.(-1)} />
                <IconButton label="Next occurrence" icon={ChevronRight} size="s" onClick={() => onStep?.(1)} />
              </div>
            </div>
          ) : (
            <RuleBody issue={issue} matched={matched} first={first} onApply={onApply} exact={exact} matches={matches} />
          )}
        </PopoverPanel>
      )}
    </Popover.Root>
  );
}

/** The body for a rule hit: the flagged words, the reason and one chip per suggestion. */
function RuleBody({
  issue,
  matched,
  first,
  onApply,
  exact,
  matches,
}: {
  issue: Issue;
  matched: string;
  first: RefObject<HTMLButtonElement | null>;
  onApply: (issue: Issue, suggestion: string) => void;
  exact: boolean;
  matches: number;
}) {
  return (
    <>
          {!exact && (
            <p className="check-popover__wrong">
              <span className="visually-hidden">Flagged: </span>
              <strong>{matched}</strong>
            </p>
          )}
          {issue.rule.reason && <p className="muted check-popover__reason">{issue.rule.reason}</p>}
          {matches > 1 && <p className="muted check-popover__reason">{matches} matches</p>}
          {issue.rule.suggestions.length === 0 ? (
            <p className="muted check-popover__reason">Avoid this phrase.</p>
          ) : (
            <>
              <div className="check-popover__chips">
                {issue.rule.suggestions.map((s, i) => (
                  <button
                    key={s}
                    ref={i === 0 ? first : undefined}
                    type="button"
                    className={exact && s !== '' ? 'check-chip check-chip--block' : 'check-chip'}
                    onDoubleClick={() => onApply(issue, s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onApply(issue, s);
                      }
                    }}
                  >
                    {s === '' ? 'Delete passage' : exact ? s : adaptCase(matched, s)}
                  </button>
                ))}
              </div>
              <p className="muted check-popover__hint">Double-click or press Enter to apply</p>
            </>
          )}
    </>
  );
}
