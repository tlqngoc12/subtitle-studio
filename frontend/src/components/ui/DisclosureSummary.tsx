import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import './DisclosureSummary.css';

/**
 * The `<summary>` of a `<details>` with a chevron that turns down when it is open and a tap target of at least 44 px.
 * Use it for every disclosure so they look alike.
 */
export function DisclosureSummary({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <summary className={className ? `disclosure__summary ${className}` : 'disclosure__summary'}>
      <ChevronRight className="icon disclosure__chevron" aria-hidden="true" />
      {children}
    </summary>
  );
}
