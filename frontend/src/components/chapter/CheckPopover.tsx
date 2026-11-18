import * as Popover from '@radix-ui/react-popover';
import { useRef } from 'react';
import { adaptCase, type Issue } from '../../lib/checkRules';
import { PopoverPanel } from '../ui/PopoverPanel';
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
  onClose,
}: {
  issue: Issue | null;
  /** The text of the hit as written in the chapter (the suggestions follow its capital letter). */
  matched: string;
  /** The underlined mark the popover hangs under. */
  anchor: () => HTMLElement | null;
  onApply: (issue: Issue, suggestion: string) => void;
  onClose: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  const virtual = useRef({ getBoundingClientRect: () => (anchor() ?? document.body).getBoundingClientRect() });
  virtual.current.getBoundingClientRect = () => (anchor() ?? document.body).getBoundingClientRect();
  return (
    <Popover.Root open={issue !== null}>
      <Popover.Anchor virtualRef={virtual} />
      {issue && (
        <PopoverPanel
          className="check-popover"
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
          <p className="check-popover__wrong">
            <span className="visually-hidden">Flagged: </span>
            <strong>{matched}</strong>
          </p>
          {issue.rule.reason && <p className="muted check-popover__reason">{issue.rule.reason}</p>}
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
                    className="check-chip"
                    onDoubleClick={() => onApply(issue, s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onApply(issue, s);
                      }
                    }}
                  >
                    {adaptCase(matched, s)}
                  </button>
                ))}
              </div>
              <p className="muted check-popover__hint">Double-click or press Enter to apply</p>
            </>
          )}
        </PopoverPanel>
      )}
    </Popover.Root>
  );
}
