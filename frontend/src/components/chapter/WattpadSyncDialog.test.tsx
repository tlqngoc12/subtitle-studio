import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WattpadPart } from '../../api/novels';
import { fakeFetch, problem, type Route } from '../../test/fakeFetch';
import { chapterDetail } from '../../test/novelFixtures';
import { WattpadSyncDialog, normalizeTitle, sameTitlePart } from './WattpadSyncDialog';

const part = (over: Partial<WattpadPart>): WattpadPart => ({
  partId: '1',
  title: 'Part',
  wordCount: 1200,
  createdAt: '2026-11-01T00:00:00Z',
  modifiedAt: '2026-11-20T00:00:00Z',
  deleted: false,
  importedChapterId: null,
  ...over,
});

const PARTS = [
  part({ partId: '1', title: 'Prologue' }),
  part({ partId: '2', title: 'Chương 1:   Mở đầu', wordCount: 3400 }),
  part({ partId: '3', title: 'Gone', deleted: true }),
];

const partsRoute = (body: unknown = PARTS, status = 200): Route => ({
  method: 'GET', path: '/api/novels/3/wattpad/parts', status, body,
});

function open(over: { onSynced?: (c: unknown) => void; onOpenChange?: (o: boolean) => void } = {}) {
  const onSynced = over.onSynced ?? vi.fn();
  const onOpenChange = over.onOpenChange ?? vi.fn();
  render(
    <WattpadSyncDialog open onOpenChange={onOpenChange} novelId={3} chapterId={9} chapterTitle="chương 1: mở đầu"
      onSynced={onSynced} />,
  );
  return { onSynced, onOpenChange };
}

describe('same title matching', () => {
  it('ignores case, extra spaces and Unicode form', () => {
    expect(normalizeTitle('  Chương   1 ')).toBe(normalizeTitle('chương 1'));
    expect(normalizeTitle('Chương'.normalize('NFD'))).toBe(normalizeTitle('Chương'.normalize('NFC')));
    expect(sameTitlePart(PARTS, 'CHƯƠNG 1: Mở đầu')?.partId).toBe('2');
    expect(sameTitlePart([part({ partId: '9', title: 'Gone', deleted: true })], 'Gone')).toBeNull();
  });
});

describe('WattpadSyncDialog', () => {
  it('loads the parts once, preselects the one with the same title and labels it', async () => {
    const calls = fakeFetch([partsRoute()]);
    open();

    expect(screen.getByText('Loading Wattpad chapters…')).toBeInTheDocument();
    const radio = await screen.findByRole('radio', { name: /Chương 1:\s+Mở đầu/ });

    expect(radio).toBeChecked();
    expect(screen.getByText('Same title')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Prologue/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Sync' })).toBeEnabled();
    expect(calls.filter((c) => c.path === '/api/novels/3/wattpad/parts')).toHaveLength(1);
  });

  it('shows deleted parts dimmed and not selectable, and Sync is off until a part is chosen', async () => {
    fakeFetch([partsRoute([part({ partId: '1', title: 'Other' }), part({ partId: '3', title: 'Gone', deleted: true })])]);
    open();

    expect(await screen.findByRole('radio', { name: /Gone/ })).toBeDisabled();
    expect(screen.getByText('Deleted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync' })).toBeDisabled();

    await userEvent.setup().click(screen.getByRole('radio', { name: /Other/ }));
    expect(screen.getByRole('button', { name: 'Sync' })).toBeEnabled();
  });

  it('shows a load error with Retry', async () => {
    const calls = fakeFetch([partsRoute(problem(502, 'WATTPAD_UNAVAILABLE', 'down'), 502)]);
    open();

    expect(await screen.findByRole('alert')).toHaveTextContent('Wattpad did not answer. Try again later.');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(calls.filter((c) => c.path.endsWith('/wattpad/parts'))).toHaveLength(2));
  });

  it('says the story has no link', async () => {
    fakeFetch([partsRoute(problem(409, 'NOVEL_NOT_WATTPAD', 'x'), 409)]);
    open();

    expect(await screen.findByRole('alert')).toHaveTextContent('This story has no Wattpad link.');
  });

  it('asks to confirm with the exact words, and Cancel does not call the API', async () => {
    const calls = fakeFetch([partsRoute()]);
    const { onSynced } = open();
    const user = userEvent.setup();
    await screen.findByRole('radio', { name: /Chương 1:\s+Mở đầu/ });

    await user.click(screen.getByRole('button', { name: 'Sync' }));

    const confirm = screen.getByRole('group', { name: "Replace this chapter's text?" });
    expect(confirm).toHaveTextContent(
      'Are you sure you want to replace the text of "chương 1: mở đầu" with "Chương 1: Mở đầu" from Wattpad? Your current text will be lost, including any unsaved changes. The chapter title stays the same.'.replace('Chương 1: Mở đầu', 'Chương 1:   Mở đầu').replace(/\s+/g, ' '),
    );
    expect(within(confirm).getByRole('button', { name: 'Replace text' })).toHaveClass('button--danger-solid');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('radio', { name: /Prologue/ })).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    expect(onSynced).not.toHaveBeenCalled();
  });

  it('Replace text calls the API with the part, then closes and hands over the chapter', async () => {
    const synced = chapterDetail({ text: 'From Wattpad', sourceType: 'ORIGINAL', wattpadLinked: true });
    const calls = fakeFetch([
      partsRoute(),
      { method: 'POST', path: '/api/chapters/9/wattpad-sync', status: 200, body: synced },
    ]);
    const { onSynced, onOpenChange } = open();
    const user = userEvent.setup();
    await screen.findByRole('radio', { name: /Chương 1:\s+Mở đầu/ });
    await user.click(screen.getByRole('button', { name: 'Sync' }));

    await user.click(screen.getByRole('button', { name: 'Replace text' }));

    await waitFor(() => expect(onSynced).toHaveBeenCalledWith(synced));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(JSON.parse(String(calls.find((c) => c.method === 'POST')!.body))).toEqual({ partId: '2' });
  });

  it('shows "Syncing…" while it runs and an error from the server without losing the list', async () => {
    let release!: () => void;
    const delay = new Promise<void>((r) => (release = r));
    fakeFetch([
      partsRoute(),
      { method: 'POST', path: '/api/chapters/9/wattpad-sync', status: 409, body: problem(409, 'WATTPAD_PART_EMPTY', 'x'), delay },
    ]);
    const { onSynced } = open();
    const user = userEvent.setup();
    await screen.findByRole('radio', { name: /Chương 1:\s+Mở đầu/ });
    await user.click(screen.getByRole('button', { name: 'Sync' }));

    await user.click(screen.getByRole('button', { name: 'Replace text' }));
    expect(screen.getByRole('button', { name: 'Syncing…' })).toBeDisabled();
    release();

    expect(await screen.findByRole('alert')).toHaveTextContent('Wattpad has no text for this part');
    expect(screen.getByRole('radio', { name: /Prologue/ })).toBeInTheDocument();
    expect(onSynced).not.toHaveBeenCalled();
  });
});
