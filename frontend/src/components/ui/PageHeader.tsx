import type { ReactNode } from 'react';

/**
 * The page title block. With `actions` the text and the actions sit in one row (`masthead--row`).
 */
export function PageHeader({
  title,
  lede,
  actions,
  className,
}: {
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const text = (
    <>
      <h1 className="masthead__name">{title}</h1>
      {lede && <p className="masthead__lede">{lede}</p>}
    </>
  );
  const base = actions ? 'masthead masthead--row' : 'masthead';
  return (
    <header className={className ? `${base} ${className}` : base}>
      {actions ? (
        <>
          <div>{text}</div>
          {actions}
        </>
      ) : (
        text
      )}
    </header>
  );
}
