import { Toaster } from 'sonner';
import './AppToaster.css';

/**
 * Where toasts appear (sonner): centre of the screen (top-center + a top offset of half the viewport, desktop and mobile), closable, gone after 4 s.
 * Colours follow the app tokens (AppToaster.css), so a forced data-theme is honoured as well as the OS theme.
 * Format: a short title with no trailing period, specifics in `description`; errors go through `toastError` (lib/toast.ts).
 * Rendered once in <App> (and in page tests that check toasts).
 */
const CENTRE = { top: 'calc(50vh - 40px)' };

export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      offset={CENTRE}
      mobileOffset={CENTRE}
      theme="system"
      closeButton
      duration={4000}
      toastOptions={{ className: 'toast' }}
    />
  );
}
