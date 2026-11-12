import * as Popover from '@radix-ui/react-popover';
import { CalendarDays } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { formatDay, parseDay } from '../../lib/dates';
import { PopoverPanel } from './PopoverPanel';
import './DatePicker.css';

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-11-09` → a local Date at that day (built from the parts, never `new Date(iso)`, which is UTC). */
export function fromIsoDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** A local Date → `yyyy-mm-dd` from its local year, month and day. */
export function toIsoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}


interface Props {
  id?: string;
  /** `yyyy-mm-dd` or null. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Shown while the field is empty. */
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

const INVALID_MESSAGE = 'Enter a date as dd/mm/yyyy';

/**
 * A text field that takes `dd/MM/yyyy` (also `d/M/yyyy`, `-` or `.` as separators), plus a button that opens a calendar.
 * Strings in and out are `yyyy-mm-dd`, with no time-zone shifts. The typed text commits on blur or Enter; text that is
 * not a real day stays in the field with an error and does not call `onChange`. Esc restores the last valid value.
 */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = 'dd/mm/yyyy',
  clearable,
  disabled,
  'aria-describedby': describedBy,
  'aria-invalid': invalidProp,
}: Props) {
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const saved = value ? formatDay(value) : '';
  const [text, setText] = useState(saved);
  const [invalid, setInvalid] = useState(false);
  const selected = value ? fromIsoDay(value) : undefined;
  const thisYear = new Date().getFullYear();
  // The year dropdown always reaches the stored value, however old or far ahead it is.
  const year = selected?.getFullYear() ?? thisYear;

  // The value changed from outside (calendar, a reload, the parent): show it.
  useEffect(() => {
    setText(value ? formatDay(value) : '');
    setInvalid(false);
  }, [value]);

  function restore() {
    setText(saved);
    setInvalid(false);
  }

  function commit() {
    const typed = text.trim();
    if (typed === saved) {
      setInvalid(false);
      return;
    }
    if (typed === '') {
      if (clearable) onChange(null);
      else restore();
      return;
    }
    const iso = parseDay(typed);
    if (iso === null) {
      setInvalid(true);
      return;
    }
    setText(formatDay(iso));
    setInvalid(false);
    if (iso !== value) onChange(iso);
  }

  function pick(iso: string | null) {
    onChange(iso);
    setText(iso ? formatDay(iso) : '');
    setInvalid(false);
    setOpen(false);
  }

  const describedby = [describedBy, invalid ? errorId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className="date-picker__field">
        <Popover.Anchor asChild>
          <div className="date-picker__control">
            <input
              id={id}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="date-picker__input"
              placeholder={placeholder}
              disabled={disabled}
              value={text}
              aria-invalid={invalid || invalidProp || undefined}
              aria-describedby={describedby}
              onChange={(e) => setText(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault(); // commit, do not submit the form around the field
                  commit();
                } else if (e.key === 'Escape' && (text !== saved || invalid)) {
                  e.stopPropagation(); // restores the field only, not the dialog around it
                  restore();
                }
              }}
            />
            <Popover.Trigger asChild>
              <button type="button" className="date-picker__open" aria-label="Open calendar" disabled={disabled}>
                <CalendarDays className="icon icon--sm" aria-hidden="true" />
              </button>
            </Popover.Trigger>
          </div>
        </Popover.Anchor>
        {invalid && (
          <p id={errorId} className="field__error">
            {INVALID_MESSAGE}
          </p>
        )}
      </div>
      <PopoverPanel className="date-picker" align="start">
        <DayPicker
          mode="single"
          weekStartsOn={1}
          captionLayout="dropdown"
          startMonth={new Date(Math.min(thisYear - 30, year), 0)}
          endMonth={new Date(Math.max(thisYear + 10, year), 11)}
          defaultMonth={selected}
          selected={selected}
          onSelect={(date) => {
            if (date) pick(toIsoDay(date));
          }}
        />
        <div className="date-picker__footer">
          <button type="button" className="button button--s" onClick={() => pick(toIsoDay(new Date()))}>
            Today
          </button>
          {clearable && (
            <button type="button" className="button button--s button--ghost" onClick={() => pick(null)}>
              Clear
            </button>
          )}
        </div>
      </PopoverPanel>
    </Popover.Root>
  );
}
