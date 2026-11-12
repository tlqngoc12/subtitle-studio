import * as Popover from '@radix-ui/react-popover';
import { ChevronDown } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { PopoverPanel } from './PopoverPanel';
import './Combobox.css';

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  /** Open the list when the field gets focus (by keyboard or click), not only when it is clicked or typed in. */
  openOnFocus?: boolean;
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * A text field with a list of suggestions (replaces `<input list>` + `<datalist>`): free text is always allowed, the
 * list filters while typing, arrows move, Enter picks the highlighted one and Esc closes. The list is a Radix Popover
 * in a portal, so a dialog's `overflow` never clips it.
 */
export function Combobox({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
  openOnFocus,
  disabled,
  'aria-invalid': invalid,
  'aria-describedby': describedBy,
}: Props) {
  const listId = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false); // typed since opening: only then does the text filter the list
  const [active, setActive] = useState(-1);

  const needle = value.trim().toLowerCase();
  const options = dirty && needle ? suggestions.filter((s) => s.toLowerCase().includes(needle)) : suggestions;
  const visible = open && options.length > 0;
  const optionId = (i: number) => `${listId}-${i}`;

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function pick(option: string) {
    onChange(option);
    setDirty(false);
    close();
  }

  function move(step: 1 | -1) {
    if (!visible) {
      setOpen(true);
      setActive(step === 1 ? 0 : options.length - 1);
      return;
    }
    const next = active + step;
    const wrapped = next < 0 ? options.length - 1 : next >= options.length ? 0 : next;
    setActive(wrapped);
    document.getElementById(optionId(wrapped))?.scrollIntoView?.({ block: 'nearest' });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter' && visible && active >= 0) {
      e.preventDefault(); // pick, do not submit the form around the field
      pick(options[active]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation(); // closes the list only, not the dialog around it
      close();
    } else if (e.key === 'Tab') {
      close();
    }
  }

  return (
    <Popover.Root open={visible} onOpenChange={(o) => !o && close()}>
      <Popover.Anchor asChild>
        <div className="combobox" ref={anchor}>
          <input
            id={id}
            type="text"
            role="combobox"
            className="combobox__input"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={visible}
            aria-controls={visible ? listId : undefined}
            aria-activedescendant={visible && active >= 0 ? optionId(active) : undefined}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            placeholder={placeholder}
            disabled={disabled}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setDirty(true);
              setActive(-1);
              setOpen(true);
            }}
            onClick={() => {
              if (!open) {
                setDirty(false);
                setOpen(true);
              }
            }}
            onFocus={() => {
              if (openOnFocus && !open) {
                setDirty(false);
                setOpen(true);
              }
            }}
            onBlur={close}
            onKeyDown={onKeyDown}
          />
          <ChevronDown className="combobox__chevron icon icon--sm" aria-hidden="true" />
        </div>
      </Popover.Anchor>
      <PopoverPanel
        className="combobox__panel"
        role="presentation"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (anchor.current?.contains(e.target as Node)) e.preventDefault();
        }}
      >
        <ul id={listId} role="listbox" aria-label="Suggestions" className="combobox__list">
          {options.map((option, i) => (
            <li
              key={option}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className="combobox__option"
              onMouseDown={(e) => e.preventDefault()} // keep the focus in the input
              onMouseMove={() => setActive(i)}
              onClick={() => pick(option)}
            >
              {option}
            </li>
          ))}
        </ul>
      </PopoverPanel>
    </Popover.Root>
  );
}
