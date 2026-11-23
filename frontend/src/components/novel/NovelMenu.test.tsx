import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { answerConfirm } from '../../test/confirm';
import { fakeFetch, problem } from '../../test/fakeFetch';
import { novelSummary } from '../../test/novelFixtures';
import * as download from '../../lib/download';
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
    expect(toast.success).toHaveBeenCalledWith('Novel added to banner');
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
    expect(toast.success).toHaveBeenCalledWith('Novel removed from banner');
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

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The banner already has 5 novels', { description: 'Remove one from the banner first.' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('puts Export right after the banner item and saves the zip', async () => {
    const calls = fakeFetch([
      {
        method: 'GET',
        path: '/api/novels/3/export',
        status: 200,
        body: 'zip',
        headers: { 'Content-Disposition': 'attachment; filename="n.zip"' },
      },
    ]);
    const save = vi.spyOn(download, 'saveBlob').mockImplementation(() => {});
    render(<NovelMenu novel={novelSummary()} pickedCount={0} onChange={vi.fn()} />);

    await openMenu();
    const items = screen.getAllByRole('button').filter((b) => b.className.includes('member-menu__item'));
    expect(items.map((b) => b.textContent)).toEqual(['Add to banner', 'Export']);
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.any(Blob), 'n.zip'));
    expect(calls[0].path).toBe('/api/novels/3/export');
  });

  it('disables Export for a novel without chapters', async () => {
    render(<NovelMenu novel={novelSummary({ chapterCount: 0 })} pickedCount={0} onChange={vi.fn()} />);

    await openMenu();

    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
  });

  it('toasts the error when Export fails', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/novels/3/export', status: 409, body: problem(409, 'NOTHING_TO_EXPORT', 'No chapter has text to export yet.') },
    ]);
    render(<NovelMenu novel={novelSummary()} pickedCount={0} onChange={vi.fn()} />);

    await openMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
