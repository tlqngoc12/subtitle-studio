import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChapterDetail } from '../api/novels';
import { AppToaster } from '../components/AppToaster';
import { answerConfirm } from '../test/confirm';
import { fakeFetch, problem, type Route as FakeRoute } from '../test/fakeFetch';
import { chapterDetail } from '../test/novelFixtures';
import ChapterPage from './ChapterPage';

/** Chapter 9 is the page under test; any other id stands for "navigated to another chapter". */
function ChapterRoute() {
  const { chapterId } = useParams();
  return chapterId === '9' ? <ChapterPage /> : <p>other chapter {chapterId}</p>;
}

function renderPage(routes: FakeRoute[]) {
  const calls = fakeFetch(routes);
  render(
    <MemoryRouter initialEntries={['/novels/3/chapters/9']}>
      <AppToaster />
      <Routes>
        <Route path="/novels/:id" element={<p>novel page</p>} />
        <Route path="/novels/:id/chapters/:chapterId" element={<ChapterRoute />} />
      </Routes>
    </MemoryRouter>,
  );
  return calls;
}

const get = (over: Partial<ChapterDetail> = {}): FakeRoute => ({
  method: 'GET',
  path: '/api/chapters/9',
  status: 200,
  body: chapterDetail(over),
});

const user = () => userEvent.setup(vi.isFakeTimers() ? { advanceTimers: vi.advanceTimersByTime } : {});

async function loaded() {
  return screen.findByRole('heading', { name: 'Chapter 1: Mở đầu' });
}

const textBox = () => screen.getByLabelText('Chapter text');

describe('ChapterPage', () => {
  afterEach(() => vi.useRealTimers());

  it('edits the whole chapter in one box, with the screenshots apart', async () => {
    renderPage([get()]);
    await loaded();

    expect(textBox()).toHaveValue('Trang một\n\nTrang hai');
    expect(screen.queryByLabelText('Page 1 translation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enlarge page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enlarge page 2' })).toBeInTheDocument();
    expect(screen.getByText('Translated')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('uploads several screenshots', async () => {
    const calls = renderPage([
      get({ pages: [], text: '' }),
      {
        method: 'POST',
        path: '/api/chapters/9/pages',
        status: 201,
        body: [
          { id: 21, position: 1, mediaUrl: '/api/media/21', textVi: null },
          { id: 22, position: 2, mediaUrl: '/api/media/22', textVi: null },
        ],
      },
    ]);
    await loaded();

    await user().upload(screen.getByLabelText('Add page screenshots'), [
      new File(['a'], 'p1.png', { type: 'image/png' }),
      new File(['b'], 'p2.png', { type: 'image/png' }),
    ]);

    expect(await screen.findByRole('button', { name: 'Enlarge page 2' })).toBeInTheDocument();
    const body = calls.find((c) => c.method === 'POST')!.body as FormData;
    expect(body.getAll('files')).toHaveLength(2);
  });

  describe('drag and drop', () => {
    let spy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const li = this.closest('li');
        const index = li?.parentElement ? Array.from(li.parentElement.children).indexOf(li) : 0;
        const top = index * 60;
        return { x: 0, y: top, top, left: 0, right: 600, bottom: top + 50, width: 600, height: 50, toJSON() {} } as DOMRect;
      });
    });
    afterEach(() => spy.mockRestore());

    it('reorders pages with the keyboard', async () => {
      const calls = renderPage([
        get(),
        {
          method: 'PUT',
          path: '/api/chapters/9/pages/order',
          status: 200,
          body: [
            { id: 12, position: 1, mediaUrl: '/api/media/6', textVi: 'Trang hai' },
            { id: 11, position: 2, mediaUrl: '/api/media/5', textVi: 'Trang một' },
          ],
        },
      ]);
      await loaded();
      const handle = screen.getByRole('button', { name: 'Drag to reorder: page 1' });

      const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));
      handle.focus();
      fireEvent.keyDown(handle, { key: ' ', code: 'Space' });
      await tick();
      fireEvent.keyDown(document.activeElement ?? handle, { key: 'ArrowDown', code: 'ArrowDown' });
      await tick();
      fireEvent.keyDown(document.activeElement ?? handle, { key: ' ', code: 'Space' });

      await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
      expect(JSON.parse(String(calls.find((c) => c.method === 'PUT')!.body))).toEqual({ pageIds: [12, 11] });
    });
  });

  it('deletes a page after confirming', async () => {
    const calls = renderPage([get(), { method: 'DELETE', path: '/api/chapters/9/pages/11', status: 204 }]);
    await loaded();

    await user().click(screen.getByRole('button', { name: 'Delete page 1' }));
    await answerConfirm('Delete', 'Delete page 1?');

    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    expect(screen.queryByRole('button', { name: 'Enlarge page 2' })).not.toBeInTheDocument();
  });

  it('saves the whole chapter text', async () => {
    const calls = renderPage([
      get(),
      {
        method: 'PUT',
        path: '/api/chapters/9',
        status: 200,
        body: chapterDetail({ text: 'Cả chương đã sửa', editedAfterTranslation: true }),
      },
    ]);
    await loaded();

    await user().clear(textBox());
    await user().type(textBox(), 'Cả chương đã sửa');
    await user().click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const sent = JSON.parse(String(calls.find((c) => c.method === 'PUT')!.body));
    expect(sent).toEqual({ chapterNo: 1, title: 'Mở đầu', text: 'Cả chương đã sửa' });
    await waitFor(() => expect(textBox()).toHaveValue('Cả chương đã sửa'));
  });

  it('asks before leaving with unsaved edits', async () => {
    renderPage([get()]);
    await loaded();

    await user().type(textBox(), '!');
    await user().click(screen.getByRole('link', { name: 'Next chapter' }));
    await answerConfirm('Leave', 'Leave without saving?');

    expect(await screen.findByText('other chapter 10')).toBeInTheDocument();
  });

  it('leaves at once when nothing changed', async () => {
    renderPage([get()]);
    await loaded();

    await user().click(screen.getByRole('link', { name: 'Next chapter' }));

    expect(await screen.findByText('other chapter 10')).toBeInTheDocument();
  });

  it('confirms before translating over edited text', async () => {
    const calls = renderPage([
      get({ editedAfterTranslation: true }),
      { method: 'POST', path: '/api/chapters/9/translate', status: 202, body: chapterDetail({ translationStatus: 'TRANSLATING' }) },
    ]);
    await loaded();

    await user().click(screen.getByRole('button', { name: 'Translate again' }));
    await answerConfirm('Translate again', 'Translate this chapter again?');

    await waitFor(() => expect(calls.some((c) => c.path === '/api/chapters/9/translate')).toBe(true));
  });

  it('locks editing while translating and shows the new text when done', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const routes: FakeRoute[] = [get({ translationStatus: 'TRANSLATING' })];
    renderPage(routes);
    await loaded();

    expect(textBox()).toBeDisabled();
    expect(screen.getByLabelText('Add page screenshots')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(screen.getByText('Translating…')).toBeInTheDocument();

    routes[0] = get({ translationStatus: 'TRANSLATED', text: 'Mới một\n\nMới hai' });
    await vi.advanceTimersByTimeAsync(3000);

    await waitFor(() => expect(textBox()).toHaveValue('Mới một\n\nMới hai'));
    expect(textBox()).toBeEnabled();
  });

  it('shows why a translation failed', async () => {
    renderPage([get({ translationStatus: 'FAILED', translationError: 'Gemini free quota is used up, try again later.' })]);
    await loaded();

    expect(screen.getByText('Gemini free quota is used up, try again later.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Translate again' })).toBeEnabled();
  });

  it('publishes, and explains when pages are missing a translation', async () => {
    const routes: FakeRoute[] = [
      get(),
      {
        method: 'POST',
        path: '/api/chapters/9/publish',
        status: 409,
        body: problem(409, 'CHAPTER_NOT_TRANSLATED', 'missing'),
      },
    ];
    renderPage(routes);
    await loaded();

    await user().click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Every page needs a translation before publishing.')).toBeInTheDocument();

    routes[1] = { method: 'POST', path: '/api/chapters/9/publish', status: 200, body: chapterDetail({ publishStatus: 'PUBLISHED' }) };
    await user().click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Chapter' })).getByText('Published')).toBeInTheDocument();
  });

  it('does not let Unpublish drop unsaved edits', async () => {
    renderPage([get({ publishStatus: 'PUBLISHED' })]);
    await loaded();
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeEnabled();

    await user().type(textBox(), '!');

    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeDisabled();
  });

  it('shows only the text and title of a published chapter', async () => {
    renderPage([get({ publishStatus: 'PUBLISHED' })]);
    await loaded();

    expect(screen.getByText(/This chapter is published: only the text can be edited\./)).toBeInTheDocument();
    expect(textBox()).toBeEnabled();
    expect(screen.getByLabelText('Chapter title (optional)')).toBeEnabled();
    expect(screen.queryByLabelText('Chapter number')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add page screenshots')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Pages' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Translate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enlarge page 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
  });

  it('keeps every control on a draft chapter', async () => {
    renderPage([get()]);
    await loaded();

    expect(screen.queryByText(/This chapter is published/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Chapter number')).toBeEnabled();
    expect(screen.getByLabelText('Add page screenshots')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Translate again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drag to reorder: page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete page 1' })).toBeInTheDocument();
  });

  it('links to the neighbouring chapters', async () => {
    renderPage([get({ prevChapterId: 8, nextChapterId: 10 })]);
    await loaded();

    expect(screen.getByRole('link', { name: 'Previous chapter' })).toHaveAttribute('href', '/novels/3/chapters/8');
    expect(screen.getByRole('link', { name: 'Next chapter' })).toHaveAttribute('href', '/novels/3/chapters/10');
  });
});
