import { Toaster } from 'sonner';

/**
 * Where toasts appear (sonner): bottom-right, closable, gone after 4 s, following the OS light/dark theme.
 * Show one with `toast.success('…')` from 'sonner'. Rendered once in <App> (and in page tests that check toasts).
 */
export function AppToaster() {
  return <Toaster position="bottom-right" theme="system" closeButton duration={4000} toastOptions={{ className: 'toast' }} />;
}
