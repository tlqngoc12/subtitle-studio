import { toast } from 'sonner';
import type { ErrorMessage } from './errors';

/**
 * Shows an error toast in the app's one format: a short title without a trailing period, and the hint (if any) as the
 * description. Every error toast goes through here.
 */
export function toastError(message: ErrorMessage): void {
  toast.error(message.title.replace(/\.$/, ''), message.hint ? { description: message.hint } : undefined);
}

/** Warns when a Wattpad fetch had to skip images it could not download (the chapter itself was still created). */
export function toastSkippedImages(count: number | undefined): void {
  if (!count || count < 1) return;
  toast.warning(`${count} image${count === 1 ? '' : 's'} could not be downloaded`, {
    description: 'Use Reload original to try again.',
  });
}

/** The copy buttons' two outcomes. */
export function toastCopied(): void {
  toast.success('Copied');
}

export function toastCopyFailed(): void {
  toast.error('Could not copy');
}
