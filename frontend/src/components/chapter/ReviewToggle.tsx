import { ClipboardCheck } from 'lucide-react';
import { Tip } from '../Tip';
import './Check.css';

/**
 * The Review button beside Check (original stories only): loads the chapter's newest review file and underlines its
 * passages. Same look as Check (purple "selected" while on). Off while the chapter is translating, with a tooltip.
 */
export function ReviewToggle({
  on,
  count,
  loading,
  disabled,
  onToggle,
}: {
  on: boolean;
  count: number;
  loading: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const button = (
    <button
      type="button"
      className="button button--s check-toggle"
      aria-pressed={on}
      aria-disabled={disabled || loading || undefined}
      onClick={() => !disabled && !loading && onToggle()}
    >
      <ClipboardCheck className="icon" aria-hidden="true" />
      {on ? `Review · ${count}` : 'Review'}
    </button>
  );
  return (
    <Tip label="Review is off while the chapter is translating" disabled={!disabled}>
      {button}
    </Tip>
  );
}
