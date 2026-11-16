import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toastError, toastSkippedImages } from './toast';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn() } }));

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

describe('toastSkippedImages', () => {
  beforeEach(() => vi.mocked(toast.warning).mockClear());

  it('says nothing when no image was skipped', () => {
    toastSkippedImages(undefined);
    toastSkippedImages(0);
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('counts the skipped images', () => {
    toastSkippedImages(1);
    toastSkippedImages(3);
    expect(toast.warning).toHaveBeenNthCalledWith(1, '1 image could not be downloaded', expect.anything());
    expect(toast.warning).toHaveBeenNthCalledWith(2, '3 images could not be downloaded', expect.anything());
  });
});
