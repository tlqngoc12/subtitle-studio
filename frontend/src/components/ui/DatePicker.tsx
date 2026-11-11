import * as Popover from '@radix-ui/react-popover';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
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

/** `2026-11-09` → `09/11/2026`. */
function display(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

interface Props {
  id?: string;
  /** `yyyy-mm-dd` or null. */
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/** A field-looking button that opens a calendar. Strings in and out are `yyyy-mm-dd`, with no time-zone shifts. */
export function DatePicker({ id, value, onChange, placeholder = 'Select a date', clearable, disabled, ...aria }: Props) {
  const [open, setOpen] = useState(false);
  const selected = value ? fromIsoDay(value) : undefined;
  const thisYear = new Date().getFullYear();

  function pick(iso: string | null) {
    onChange(iso);
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          className="field-control date-picker__trigger"
          disabled={disabled}
          {...aria}
        >
          <CalendarDays className="icon icon--sm" aria-hidden="true" />
          <span className={value ? undefined : 'date-picker__placeholder'}>{value ? display(value) : placeholder}</span>
        </button>
      </Popover.Trigger>
      <PopoverPanel className="date-picker" align="start">
        <DayPicker
          mode="single"
          weekStartsOn={1}
          captionLayout="dropdown"
          startMonth={new Date(thisYear - 30, 0)}
          endMonth={new Date(thisYear + 10, 11)}
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
