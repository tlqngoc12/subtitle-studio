import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { answerConfirm } from '../../test/confirm';
import { fakeFetch, problem } from '../../test/fakeFetch';
import { novelSummary } from '../../test/novelFixtures';
import { NovelMenu } from './NovelMenu';

vi.mock('sonner', async (orig) => ({
  ...(await orig<typeof import('sonner')>()),
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: /Menu for/ }));
}

describe('NovelMenu', () => {
  it('adds a novel to the banner and reports the updated summary', async () => {
    const calls = fakeFetch([
      { method: 'PUT', path: '/api/novels/3/featured', status: 200, body: novelSummary({ featured: true }) },
    ]);
    const onChange = vi.fn();
    render(<NovelMenu novel={novelSummary()} pickedCount={2} onChange={onChange} />);

    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Add to banner' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ featured: true })));
    expect(calls[0].body).toBe(JSON.stringify({ featured: true }));
    expect(toast.success).toHaveBeenCalledWith('Added to banner');
  });

  it('removes a picked novel from the banner, even when 5 are picked', async () => {
    const calls = fakeFetch([
      { method: 'PUT', path: '/api/novels/3/featured', status: 200, body: novelSummary({ featured: false }) },
    ]);
    const onChange = vi.fn();
    render(<NovelMenu novel={novelSummary({ featured: true })} pickedCount={5} onChange={onChange} />);

    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Remove from banner' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ featured: false })));
    expect(calls[0].body).toBe(JSON.stringify({ featured: false }));
    expect(toast.success).toHaveBeenCalledWith('Removed from banner');
  });

  it('shows an alert and calls no API when 5 novels are already picked', async () => {
    const calls = fakeFetch([]);
    const onChange = vi.fn();
    render(<NovelMenu novel={novelSummary()} pickedCount={5} onChange={onChange} />);

    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Add to banner' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('Banner is full');
    expect(dialog).toHaveTextContent('The banner already has 5 novels. Remove one before adding another.');
    await answerConfirm('OK');
    expect(calls).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows the API error when the server refuses', async () => {
    fakeFetch([
      {
        method: 'PUT',
        path: '/api/novels/3/featured',
        status: 409,
        body: problem(409, 'BANNER_FULL', 'The banner already has 5 novels. Remove one first.'),
      },
    ]);
    const onChange = vi.fn();
    render(<NovelMenu novel={novelSummary()} pickedCount={1} onChange={onChange} />);

    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Add to banner' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('banner already has 5')));
    expect(onChange).not.toHaveBeenCalled();
  });
});
