import * as Tabs from '@radix-ui/react-tabs';
import { useState, type ComponentProps } from 'react';

/**
 * A Radix tab trigger that does not draw the keyboard focus ring after a mouse or touch click.
 *
 * Radix Tabs focuses the trigger from script on mousedown (`event.currentTarget.focus()`), and Chromium treats
 * script focus as :focus-visible, so a click would show the ring. Recording the pointer press (it fires before
 * the focus) lets the stylesheet hide the ring for that focus only; a key press or blur clears the mark, so
 * Tab and the arrow keys still show it.
 */
export function TabTrigger({ onPointerDown, onKeyDown, onBlur, ...props }: ComponentProps<typeof Tabs.Trigger>) {
  const [byPointer, setByPointer] = useState(false);
  return (
    <Tabs.Trigger
      {...props}
      data-pointer={byPointer ? '' : undefined}
      onPointerDown={(e) => {
        setByPointer(true);
        onPointerDown?.(e);
      }}
      onKeyDown={(e) => {
        setByPointer(false);
        onKeyDown?.(e);
      }}
      onBlur={(e) => {
        setByPointer(false);
        onBlur?.(e);
      }}
    />
  );
}
