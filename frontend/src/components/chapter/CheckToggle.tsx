import { ChevronLeft, ChevronRight, SpellCheck } from 'lucide-react';
import { Tip } from '../Tip';
import { IconButton } from '../ui/IconButton';
import './Check.css';

/** The compact `Check · N ‹ ›` shown in the sticky chapter bar while Check is on, so stepping needs no scrolling back up. */
export function CheckNavigator({
  count,
  onPrev,
  onNext,
}: {
  count: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="check-nav">
      <span className="check-nav__count">Check · {count}</span>
      <IconButton size="s" icon={ChevronLeft} label="Previous issue (Shift+F8)" disabled={count === 0} onClick={onPrev} />
      <IconButton size="s" icon={ChevronRight} label="Next issue (F8)" disabled={count === 0} onClick={onNext} />
    </div>
  );
}

/**
 * The Check button on the right of the "Chapter text" label: a toggle that shows how many hits there are, ‹ › to step
 * through them and a note when some rule lines of the profile could not be read. When it cannot be used it stays
 * focusable (aria-disabled) so its tooltip can say why.
 */
export function CheckToggle({
  on,
  count,
  disabledReason,
  ignored,
  onToggle,
  onPrev,
  onNext,
}: {
  on: boolean;
  count: number;
  disabledReason: string | null;
  ignored: number;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const disabled = disabledReason !== null;
  const button = (
    <button
      type="button"
      className="button button--s check-toggle"
      aria-pressed={on}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onToggle()}
    >
      <SpellCheck className="icon" aria-hidden="true" />
      {on ? `Check · ${count}` : 'Check'}
    </button>
  );
  return (
    <div className="check-bar">
      {on && (
        <>
          {ignored > 0 && (
            <span className="muted check-bar__note">
              {ignored} {ignored === 1 ? 'line' : 'lines'} in ## Kiểm tra could not be read
            </span>
          )}
          <IconButton size="s" icon={ChevronLeft} label="Previous issue (Shift+F8)" disabled={count === 0} onClick={onPrev} />
          <IconButton size="s" icon={ChevronRight} label="Next issue (F8)" disabled={count === 0} onClick={onNext} />
        </>
      )}
      <Tip label={disabledReason ?? ''} disabled={!disabled}>
        {button}
      </Tip>
    </div>
  );
}
