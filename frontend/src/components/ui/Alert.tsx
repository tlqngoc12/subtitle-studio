import type { ReactNode } from 'react';

/** An error block: a title, an optional hint, and any extra content (such as a link back). Announced to screen readers. */
export function Alert({
  title,
  hint,
  className,
  children,
}: {
  title: string;
  hint?: string | null;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={className ? `alert ${className}` : 'alert'} role="alert">
      <p className="alert__title">{title}</p>
      {hint && <p className="alert__hint">{hint}</p>}
      {children}
    </div>
  );
}
