import { useEffect, useState } from 'react';

/** The visible area must be this much shorter than the window before it counts as an on-screen keyboard. */
export const KEYBOARD_MIN_PX = 150;

/**
 * True while an on-screen keyboard is open (the visual viewport is much shorter than the window). While mounted it
 * publishes the visible height as `--vv-height` on `<html>`. Without `visualViewport` it does nothing.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty('--vv-height', `${vv.height}px`);
      setOpen(window.innerHeight - vv.height > KEYBOARD_MIN_PX);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      root.style.removeProperty('--vv-height');
    };
  }, []);
  return open;
}
