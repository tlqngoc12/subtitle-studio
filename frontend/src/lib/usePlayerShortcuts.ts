import { useEffect, useRef } from 'react';
import { isTyping } from './keyboard';

export interface PlayerShortcutHandlers {
  togglePlay: () => void;
  /** Positive seconds jump forward, negative back. */
  seekBy: (seconds: number) => void;
  toggleMute: () => void;
  toggleCaptions: () => void;
  toggleHelp: () => void;
}

/** Elements that use Space themselves (activating them), so Space must not also pause the video. */
const ACTIVATES_ON_SPACE = 'button, a[href], summary, [role="button"], [role="switch"], [role="tab"]';

/**
 * Page-level player keys (YouTube's own only work while the iframe has focus): K / Space play or pause,
 * J / L back or forward 10 s, Left / Right 5 s, M mute, C Vietsub on/off, ? the shortcut list.
 * Ignored while typing, with Ctrl/Meta/Alt, with Shift on a letter (Shift+N / Shift+P are the playlist's) and
 * inside a dialog or popover. Space is left to buttons and links.
 */
export function usePlayerShortcuts(handlers: PlayerShortcutHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.target instanceof HTMLElement && e.target.closest('[role="dialog"]')) return;
      const h = ref.current;
      if (e.key === '?') {
        h.toggleHelp();
        e.preventDefault();
        return;
      }
      if (e.shiftKey) return;
      switch (e.key) {
        case ' ':
          if (e.target instanceof HTMLElement && e.target.closest(ACTIVATES_ON_SPACE)) return;
          h.togglePlay();
          break;
        case 'k':
        case 'K':
          h.togglePlay();
          break;
        case 'j':
        case 'J':
          h.seekBy(-10);
          break;
        case 'l':
        case 'L':
          h.seekBy(10);
          break;
        case 'ArrowLeft':
          h.seekBy(-5);
          break;
        case 'ArrowRight':
          h.seekBy(5);
          break;
        case 'm':
        case 'M':
          h.toggleMute();
          break;
        case 'c':
        case 'C':
          h.toggleCaptions();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
