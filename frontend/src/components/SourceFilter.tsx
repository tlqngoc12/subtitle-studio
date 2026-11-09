import * as Popover from '@radix-ui/react-popover';
import { ListFilter } from 'lucide-react';
import { useState } from 'react';

export type Source = 'ai' | 'manual';

const CHOICES: { value: Source | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'ai', label: 'AI' },
  { value: 'manual', label: 'Manual' },
];

/** One "Filter" button opening a small radio list (All / AI / Manual); reads "Filter: AI" while a source is chosen. */
export function SourceFilter({ value, onChange }: { value: Source | null; onChange: (value: Source | null) => void }) {
  const [open, setOpen] = useState(false);
  const current = CHOICES.find((c) => c.value === value)!;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className={value === null ? 'button filter-button' : 'button filter-button filter-button--active'}
          type="button"
        >
          <ListFilter className="icon" aria-hidden="true" />
          {value === null ? 'Filter' : `Filter: ${current.label}`}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="filter-menu" side="bottom" align="end" sideOffset={6} collisionPadding={8}>
          <div role="radiogroup" aria-label="Filter by source" className="filter-menu__list">
            {CHOICES.map((c) => (
              <button
                key={c.label}
                className="filter-menu__option"
                type="button"
                role="radio"
                aria-checked={c.value === value}
                onClick={() => {
                  onChange(c.value);
                  setOpen(false);
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
