import type { ReactNode } from 'react';
import './Page.css';

/**
 * The button bar of a form: Delete apart on the left (`start`), Cancel, then Save on the right. `sticky` pins it to
 * the bottom of the screen (form pages); dialogs use the plain bar. Styles live in `Page.css`.
 */
export function FormActions({
  sticky,
  tight,
  start,
  children,
}: {
  sticky?: boolean;
  tight?: boolean;
  start?: ReactNode;
  children: ReactNode;
}) {
  const classes = ['form-actions', sticky ? 'form-actions--sticky' : '', tight ? 'form-actions--tight' : ''].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      {start && <span className="form-actions__start">{start}</span>}
      {children}
    </div>
  );
}
