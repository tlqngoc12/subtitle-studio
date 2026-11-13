import type { ComponentPropsWithRef, ReactNode } from 'react';
import './Page.css';

export type PageWidth = 'default' | 'wide' | 'narrow';

/**
 * The one `<main>` of a screen: a centred column (`default` 1120 px, `wide` 1440 px, `narrow` 760 px for forms).
 * Screens render this instead of writing `<main className="page">` by hand.
 */
export function Page({
  width = 'default',
  className,
  children,
  ...rest
}: { width?: PageWidth; className?: string; children: ReactNode } & Omit<ComponentPropsWithRef<'main'>, 'className' | 'children'>) {
  const classes = ['page', width === 'default' ? '' : `page--${width}`, className ?? ''].filter(Boolean).join(' ');
  return (
    <main {...rest} className={classes}>
      {children}
    </main>
  );
}
