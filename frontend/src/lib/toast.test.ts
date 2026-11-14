import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toastError } from './toast';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('toastError', () => {
  beforeEach(() => vi.mocked(toast.error).mockClear());

  it('strips one trailing period from the title and passes the hint as the description', () => {
    toastError({ title: 'Could not save.', hint: 'Try again.' });
    expect(toast.error).toHaveBeenCalledWith('Could not save', { description: 'Try again.' });
  });

  it('passes no description when there is no hint', () => {
    toastError({ title: 'Failed' });
    expect(toast.error).toHaveBeenCalledWith('Failed', undefined);
  });
});
