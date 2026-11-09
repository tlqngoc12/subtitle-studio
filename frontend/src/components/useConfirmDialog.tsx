import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useCallback, useRef, useState, type ReactElement } from 'react';
import './useConfirmDialog.css';

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** Label of the confirming button, e.g. "Delete" or "Replace". */
  confirmLabel: string;
  /** Red confirming button, for actions that delete data. */
  destructive?: boolean;
}

/**
 * The app's confirm dialog (Radix AlertDialog) in place of window.confirm: `await confirm({...})` resolves
 * true when confirmed, false on Cancel / Esc. Render `dialog` once in the component that calls it.
 * Focus starts on Cancel, so Enter never deletes by accident.
 */
export function useConfirmDialog(): { confirm: (options: ConfirmOptions) => Promise<boolean>; dialog: ReactElement } {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    resolver.current?.(false); // a dialog left open is answered "no"
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  }, []);

  const dialog = (
    <AlertDialog.Root open={options !== null} onOpenChange={(open) => !open && answer(false)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="confirm__overlay" />
        <AlertDialog.Content className="confirm">
          <AlertDialog.Title className="confirm__title">{options?.title}</AlertDialog.Title>
          {options?.description ? (
            <AlertDialog.Description className="confirm__description">{options.description}</AlertDialog.Description>
          ) : (
            <AlertDialog.Description className="visually-hidden">{options?.title}</AlertDialog.Description>
          )}
          <div className="confirm__actions">
            <AlertDialog.Cancel className="button button--small">Cancel</AlertDialog.Cancel>
            <AlertDialog.Action
              className={options?.destructive ? 'button button--danger-solid' : 'button button--primary'}
              onClick={() => answer(true)}
            >
              {options?.confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );

  return { confirm, dialog };
}
