import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WattpadPart } from '../../api/novels';
import { fakeFetch, problem } from '../../test/fakeFetch';
import { WattpadParts } from './WattpadParts';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

const part = (over: Partial<WattpadPart> = {}): WattpadPart => ({
  partId: '1',
  title: 'PROLOGUE',
  wordCount: 190,
  createdAt: '2025-06-21T09:32:40Z',
  modifiedAt: '2025-06-21T09:32:42Z',
  deleted: false,
  importedChapterId: null,
  ...over,
});

const PARTS = [
  part(),
  part({ partId: '2', title: 'Chapter 1: Cold Brew', wordCount: 1951, importedChapterId: 77 }),
  part({ partId: '3', title: 'Chapter 2: Three Seconds' }),
  part({ partId: '4', title: 'Removed one', deleted: true }),
];
const getParts = { method: 'GET', path: '/api/novels/3/wattpad/parts', status: 200, body: PARTS };

function renderParts(onImported = vi.fn()) {
  render(
    <MemoryRouter>
      <WattpadParts novelId={3} onImported={onImported} />
    </MemoryRouter>,
  );
  return onImported;
}

const row = (title: string) => screen.getByText(title).closest('li') as HTMLElement;

describe('WattpadParts', () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.message).mockClear();
  });

  it('lists the parts in story order with words, date and imported badge', async () => {
    fakeFetch([getParts]);
    renderParts();

    await screen.findByText('PROLOGUE');
    const titles = within(screen.getByRole('list', { name: 'Parts' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(titles[0]).toContain('PROLOGUE');
    expect(titles[3]).toContain('Removed one');
    expect(within(row('PROLOGUE')).getByText('190 words')).toBeInTheDocument();
    expect(within(row('PROLOGUE')).getByText('21/06/2025')).toBeInTheDocument();
    expect(within(row('Chapter 1: Cold Brew')).getByText('1,951 words')).toBeInTheDocument();
    expect(within(row('Chapter 1: Cold Brew')).getByRole('link', { name: /Imported/ })).toHaveAttribute(
      'href',
      '/novels/3/chapters/77',
    );
    expect(within(row('Removed one')).getByText('Deleted')).toBeInTheDocument();
  });

  it('cannot tick an imported or deleted part', async () => {
    fakeFetch([getParts]);
    renderParts();
    await screen.findByText('PROLOGUE');

    expect(within(row('PROLOGUE')).getByRole('checkbox')).toBeEnabled();
    expect(within(row('Chapter 1: Cold Brew')).getByRole('checkbox')).toBeDisabled();
    expect(within(row('Removed one')).getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });

  it('Select all new ticks only what can be imported', async () => {
    fakeFetch([getParts]);
    renderParts();
    await screen.findByText('PROLOGUE');

    await userEvent.click(screen.getByRole('button', { name: 'Select all new' }));

    expect(within(row('PROLOGUE')).getByRole('checkbox')).toBeChecked();
    expect(within(row('Chapter 2: Three Seconds')).getByRole('checkbox')).toBeChecked();
    expect(within(row('Chapter 1: Cold Brew')).getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Import 2' })).toBeEnabled();
  });

  it('imports the ticked parts, reports the result and reloads', async () => {
    const calls = fakeFetch([
      getParts,
      {
        method: 'POST',
        path: '/api/novels/3/wattpad/import',
        status: 200,
        body: {
          imported: [{ partId: '1', chapterId: 88 }],
          skipped: [],
          failed: [{ partId: '3', title: 'Chapter 2: Three Seconds', reason: 'Wattpad has no text for this part (locked, empty or removed).' }],
        },
      },
    ]);
    const onImported = renderParts();
    await screen.findByText('PROLOGUE');
    await userEvent.click(screen.getByRole('button', { name: 'Select all new' }));

    await userEvent.click(screen.getByRole('button', { name: 'Import 2' }));

    await waitFor(() => expect(vi.mocked(toast.message)).toHaveBeenCalledWith('Imported 1 · Skipped 0 · Failed 1'));
    const body = JSON.parse(calls.find((c) => c.method === 'POST')!.body as string);
    expect(body.partIds.sort()).toEqual(['1', '3']);
    expect(await screen.findByRole('alert')).toHaveTextContent('Chapter 2: Three Seconds');
    expect(screen.getByRole('alert')).toHaveTextContent('Wattpad has no text');
    expect(onImported).toHaveBeenCalled();
    expect(calls.filter((c) => c.method === 'GET' && c.path.endsWith('/parts'))).toHaveLength(2);
  });

  it('shows a plain success toast when nothing failed', async () => {
    fakeFetch([
      getParts,
      { method: 'POST', path: '/api/novels/3/wattpad/import', status: 200, body: { imported: [{ partId: '1', chapterId: 88 }], skipped: [], failed: [] } },
    ]);
    renderParts();
    await screen.findByText('PROLOGUE');
    await userEvent.click(within(row('PROLOGUE')).getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Import 1' }));

    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Imported 1 · Skipped 0 · Failed 0'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Check for new chapters asks Wattpad again', async () => {
    const calls = fakeFetch([getParts]);
    renderParts();
    await screen.findByText('PROLOGUE');

    await userEvent.click(screen.getByRole('button', { name: 'Check for new chapters' }));

    await waitFor(() => expect(calls.filter((c) => c.path === '/api/novels/3/wattpad/parts')).toHaveLength(2));
  });

  it('shows the error when Wattpad does not answer', async () => {
    fakeFetch([{ ...getParts, status: 502, body: problem(502, 'WATTPAD_UNAVAILABLE', 'x') }]);
    renderParts();

    expect(await screen.findByRole('alert')).toHaveTextContent('Wattpad did not answer. Try again later.');
  });

  it('shows an empty state when the story has no parts', async () => {
    fakeFetch([{ ...getParts, body: [] }]);
    renderParts();

    expect(await screen.findByText('Wattpad lists no parts for this story.')).toBeInTheDocument();
  });
});
