import * as Popover from '@radix-ui/react-popover';
import type { ComponentProps } from 'react';

/** A Radix Popover content in a portal with the shared `.popover` look; `className` adds the specific class. */
export function PopoverPanel({ className, ...props }: ComponentProps<typeof Popover.Content>) {
  return (
    <Popover.Portal>
      <Popover.Content
        side="bottom"
        align="end"
        sideOffset={6}
        collisionPadding={8}
        {...props}
        className={className ? `popover ${className}` : 'popover'}
      />
    </Popover.Portal>
  );
}
