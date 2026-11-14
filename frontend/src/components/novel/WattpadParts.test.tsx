import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChapterTranslationStatus, NovelDetail, WattpadPart } from '../../api/novels';
import { fakeFetch, problem } from '../../test/fakeFetch';
import { WattpadParts } from './WattpadParts';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

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
const getParts = (body: WattpadPart[] = PARTS) => ({ method: 'GET', path: '/api/novels/3/wattpad/parts', status: 200, body });
const fetchTranslate = (partId: string, status = 202, body: unknown = {}) => ({
  method: 'POST',
  path: `/api/novels/3/wattpad/parts/${partId}/fetch-translate`,
  status,
  body,
});

function novelWith(
  chapterStatus: ChapterTranslationStatus | null,
  notebookStatus: 'IDLE' | 'UPDATING' | 'FAILED' = 'IDLE',
): NovelDetail {
  return {
    id: 3,
    notebookStatus,
    chapters: chapterStatus ? [{ id: 77, chapterNo: 1, title: 'Chapter 1: Cold Brew', translationStatus: chapterStatus }] : [],
  } as unknown as NovelDetail;
}

function renderParts(novel: NovelDetail, onChanged = vi.fn()) {
  const view = render(
    <MemoryRouter>
      <WattpadParts novel={novel} onChanged={onChanged} />
    </MemoryRouter>,
  );
  return { onChanged, view };
}

const row = (title: string) => screen.getByText(title).closest('li') as HTMLElement;
const action = (title: string) => within(row(title)).getByRole('button');

describe('WattpadParts', () => {
  beforeEach(() => {
    vi.mocked(toast.info).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it('shows Fetch & translate for new parts and no checkboxes', async () => {
    fakeFetch([getParts()]);
    renderParts(novelWith('NONE'));
    await screen.findByText('PROLOGUE');

    expect(within(row('PROLOGUE')).getByRole('button', { name: /Fetch & translate/ })).toBeEnabled();
    expect(within(row('Chapter 2: Three Seconds')).getByRole('button', { name: /Fetch & translate/ })).toBeEnabled();
    expect(within(row('Removed one')).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import/ })).not.toBeInTheDocument();
    expect(within(row('PROLOGUE')).getByText('190 words')).toBeInTheDocument();
    expect(within(row('Removed one')).getByText('Deleted')).toBeInTheDocument();
  });

  it('marks the first untranslated part as Next', async () => {
    fakeFetch([getParts()]);
    renderParts(novelWith('TRANSLATED'));
    await screen.findByText('PROLOGUE');

    expect(within(row('PROLOGUE')).getByText('Next')).toBeInTheDocument();
    expect(screen.getAllByText('Next')).toHaveLength(1);
    expect(action('PROLOGUE')).toHaveClass('button--primary');
    expect(action('Chapter 2: Three Seconds')).not.toHaveClass('button--primary');
  });

  it('fetches and translates, refreshes, and ignores a double click', async () => {
    let release: () => void = () => {};
    const delay = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = fakeFetch([getParts(), { ...fetchTranslate('1'), delay }]);
    const { onChanged } = renderParts(novelWith('TRANSLATED'));
    await screen.findByText('PROLOGUE');

    await userEvent.dblClick(action('PROLOGUE'));
    expect(action('PROLOGUE')).toBeDisabled();
    release();

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(vi.mocked(toast.info)).toHaveBeenCalledWith('Translation started', { description: 'PROLOGUE' });
    await waitFor(() => expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2));
  });

  it('disables every button while a chapter translates', async () => {
    fakeFetch([getParts()]);
    renderParts(novelWith('TRANSLATING'));
    await screen.findByText('PROLOGUE');

    expect(action('PROLOGUE')).toBeDisabled();
    expect(action('Chapter 2: Three Seconds')).toBeDisabled();
    expect(within(row('Chapter 1: Cold Brew')).getByText('Translating…')).toBeInTheDocument();
  });

  it('disables every button while the notebook updates', async () => {
    fakeFetch([getParts()]);
    renderParts(novelWith('TRANSLATED', 'UPDATING'));
    await screen.findByText('PROLOGUE');

    expect(action('PROLOGUE')).toBeDisabled();
    expect(action('Chapter 2: Three Seconds')).toBeDisabled();
  });

  it('does not treat a failed notebook as busy', async () => {
    fakeFetch([getParts()]);
    renderParts(novelWith('TRANSLATED', 'FAILED'));
    await screen.findByText('PROLOGUE');

    expect(action('PROLOGUE')).toBeEnabled();
  });

  it('asks before translating out of order', async () => {
    const calls = fakeFetch([getParts(), fetchTranslate('3')]);
    renderParts(novelWith('NONE'));
    await screen.findByText('PROLOGUE');

    await userEvent.click(action('Chapter 2: Three Seconds'));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('PROLOGUE is not translated yet.');
    expect(dialog).toHaveTextContent('Translate Chapter 2: Three Seconds anyway?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    await userEvent.click(action('Chapter 2: Three Seconds'));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Translate anyway' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1));
  });

  it('shows Translate for an imported chapter that is not translated', async () => {
    fakeFetch([getParts()]);
    renderParts(novelWith('NONE'));
    await screen.findByText('PROLOGUE');

    expect(within(row('Chapter 1: Cold Brew')).getByRole('button', { name: 'Translate Chapter 1: Cold Brew' })).toBeEnabled();
  });

  it('shows a Translated badge linking to the chapter', async () => {
    fakeFetch([getParts()]);
    renderParts(novelWith('TRANSLATED'));
    await screen.findByText('PROLOGUE');

    expect(within(row('Chapter 1: Cold Brew')).getByRole('link', { name: /Translated/ })).toHaveAttribute(
      'href',
      '/novels/3/chapters/77',
    );
  });

  it('shows an error toast and reloads when the request is refused', async () => {
    fakeFetch([getParts(), fetchTranslate('1', 409, problem(409, 'NOVEL_TRANSLATION_BUSY', 'busy'))]);
    const { onChanged } = renderParts(novelWith('NONE'));
    await screen.findByText('PROLOGUE');

    await userEvent.click(action('PROLOGUE'));

    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Another chapter is still translating', expect.anything()));
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(action('PROLOGUE')).toBeEnabled());
    expect(within(row('Chapter 1: Cold Brew')).getByRole('button', { name: /^Translate / })).toBeEnabled();
  });

  it('Check for new chapters asks Wattpad again', async () => {
    const calls = fakeFetch([getParts()]);
    renderParts(novelWith('NONE'));
    await screen.findByText('PROLOGUE');

    await userEvent.click(screen.getByRole('button', { name: 'Check for new chapters' }));

    await waitFor(() => expect(calls.filter((c) => c.path === '/api/novels/3/wattpad/parts')).toHaveLength(2));
  });

  it('shows the error when Wattpad does not answer', async () => {
    fakeFetch([{ ...getParts(), status: 502, body: problem(502, 'WATTPAD_UNAVAILABLE', 'x') }]);
    renderParts(novelWith('NONE'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Wattpad did not answer. Try again later.');
  });

  it('shows an empty state when the story has no parts', async () => {
    fakeFetch([getParts([])]);
    renderParts(novelWith('NONE'));

    expect(await screen.findByText('Wattpad lists no parts for this story.')).toBeInTheDocument();
  });
});
