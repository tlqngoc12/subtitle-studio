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

describe('ChapterPage', () => {
  afterEach(() => vi.useRealTimers());

  it('shows each page next to its translation', async () => {
    renderPage([get()]);
    await loaded();

    expect(screen.getByLabelText('Page 1 translation')).toHaveValue('Trang một');
    expect(screen.getByLabelText('Page 2 translation')).toHaveValue('Trang hai');
    expect(screen.getByRole('button', { name: 'Enlarge page 1' })).toBeInTheDocument();
    expect(screen.getByText('Translated')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('uploads several screenshots', async () => {
    const calls = renderPage([
      get({ pages: [] }),
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

    expect(await screen.findByLabelText('Page 2 translation')).toHaveValue('');
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
    expect(screen.queryByLabelText('Page 2 translation')).not.toBeInTheDocument();
  });

  it('saves edited text', async () => {
    const calls = renderPage([
      get(),
      { method: 'PUT', path: '/api/chapters/9', status: 200, body: chapterDetail({ editedAfterTranslation: true }) },
    ]);
    await loaded();

    const box = screen.getByLabelText('Page 2 translation');
    await user().clear(box);
    await user().type(box, 'Sửa rồi');
    await user().click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const sent = JSON.parse(String(calls.find((c) => c.method === 'PUT')!.body));
    expect(sent.pages).toEqual([
      { id: 11, textVi: 'Trang một' },
      { id: 12, textVi: 'Sửa rồi' },
    ]);
    expect(sent.chapterNo).toBe(1);
    expect(sent.title).toBe('Mở đầu');
  });

  it('asks before leaving with unsaved edits', async () => {
    renderPage([get()]);
    await loaded();

    await user().type(screen.getByLabelText('Page 1 translation'), '!');
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

    expect(screen.getByLabelText('Page 1 translation')).toBeDisabled();
    expect(screen.getByLabelText('Add page screenshots')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(screen.getByText('Translating…')).toBeInTheDocument();

    routes[0] = get({
      translationStatus: 'TRANSLATED',
      pages: [
        { id: 11, position: 1, mediaUrl: '/api/media/5', textVi: 'Mới một' },
        { id: 12, position: 2, mediaUrl: '/api/media/6', textVi: 'Mới hai' },
      ],
    });
    await vi.advanceTimersByTimeAsync(3000);

    await waitFor(() => expect(screen.getByLabelText('Page 1 translation')).toHaveValue('Mới một'));
    expect(screen.getByLabelText('Page 1 translation')).toBeEnabled();
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

    await user().type(screen.getByLabelText('Page 1 translation'), '!');

    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeDisabled();
  });

  it('links to the neighbouring chapters', async () => {
    renderPage([get({ prevChapterId: 8, nextChapterId: 10 })]);
    await loaded();

    expect(screen.getByRole('link', { name: 'Previous chapter' })).toHaveAttribute('href', '/novels/3/chapters/8');
    expect(screen.getByRole('link', { name: 'Next chapter' })).toHaveAttribute('href', '/novels/3/chapters/10');
  });
});
