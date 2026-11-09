import type { ReactNode } from 'react';

/** The "Loading…" line shown while a list or page fetches. */
export function LoadingText({ children }: { children: ReactNode }) {
  return (
    <p className="muted" role="status">
      {children}
    </p>
  );
}
