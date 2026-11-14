import { toast } from 'sonner';
import type { ErrorMessage } from './errors';

/**
 * Shows an error toast in the app's one format: a short title without a trailing period, and the hint (if any) as the
 * description. Every error toast goes through here.
 */
export function toastError(message: ErrorMessage): void {
  toast.error(message.title.replace(/\.$/, ''), message.hint ? { description: message.hint } : undefined);
}
