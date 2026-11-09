import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChapterDetail } from '../api/novels';
import { AppToaster } from '../components/AppToaster';
import { answerConfirm } from '../test/confirm';
import { fakeFetch, problem, type Route as FakeRoute } from '../test/fakeFetch';
import { chapterDetail } from '../test/novelFixtures';
import ChapterPage, { AUTO_SAVE_MS } from './ChapterPage';
import { css } from '../test/css';


vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: { success: vi.fn(), error: vi.fn() } }));

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
  beforeEach(() => vi.mocked(toast.success).mockClear());
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
          { id: 21, position: 1, mediaUrl: '/api/media/21', textVi: null, source: null, landscape: false, suspect: false },
          { id: 22, position: 2, mediaUrl: '/api/media/22', textVi: null, source: null, landscape: false, suspect: false },
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
    expect(sent).toEqual({ chapterNo: 1, label: '', title: 'Mở đầu', text: 'Cả chương đã sửa' });
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
    expect(screen.getByLabelText('Chapter label (optional)')).toBeEnabled();
    expect(screen.queryByLabelText('Number')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add page screenshots')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Pages' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Translate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enlarge page 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
  });

  it('saves a label shown instead of the chapter number', async () => {
    const calls = renderPage([
      get(),
      {
        method: 'PUT',
        path: '/api/chapters/9',
        status: 200,
        body: chapterDetail({ chapterNo: 31, label: 'Ngoại truyện 1' }),
      },
    ]);
    await loaded();

    await user().clear(screen.getByLabelText('Number'));
    await user().type(screen.getByLabelText('Number'), '31');
    await user().type(screen.getByLabelText('Chapter label (optional)'), 'Ngoại truyện 1');
    await user().click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const sent = JSON.parse(String(calls.find((c) => c.method === 'PUT')!.body));
    expect(sent).toMatchObject({ chapterNo: 31, label: 'Ngoại truyện 1' });
    expect(await screen.findByRole('heading', { name: 'Ngoại truyện 1: Mở đầu' })).toBeInTheDocument();
  });

  it('keeps every control on a draft chapter', async () => {
    renderPage([get()]);
    await loaded();

    expect(screen.queryByText(/This chapter is published/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Number')).toBeEnabled();
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

  describe('page checks', () => {
    const rotated = [
      { id: 11, position: 1, mediaUrl: '/api/media/15', textVi: 'Trang một', source: null, landscape: false, suspect: false },
      { id: 12, position: 2, mediaUrl: '/api/media/6', textVi: 'Trang hai', source: null, landscape: false, suspect: false },
    ];
    const landscapePages = [
      { id: 11, position: 1, mediaUrl: '/api/media/5', textVi: 'Trang một', source: null, landscape: true, suspect: false },
      { id: 12, position: 2, mediaUrl: '/api/media/6', textVi: 'Trang hai', source: null, landscape: false, suspect: false },
    ];

    it('rotate right calls rotatePage and shows returned pages', async () => {
      const calls = renderPage([
        get(),
        { method: 'POST', path: '/api/chapters/9/pages/11/rotate', status: 200, body: rotated },
      ]);
      await loaded();

      await user().click(screen.getByRole('button', { name: 'Rotate page 1 right' }));

      await waitFor(() => expect(calls.some((c) => c.path === '/api/chapters/9/pages/11/rotate')).toBe(true));
      expect(JSON.parse(String(calls.find((c) => c.path.endsWith('/rotate'))!.body))).toEqual({ direction: 'RIGHT' });
      await waitFor(() =>
        expect(document.querySelector('img[src="/api/media/15"]')).not.toBeNull(),
      );
    });

    it('rotate all left calls rotatePages', async () => {
      const calls = renderPage([
        get(),
        { method: 'POST', path: '/api/chapters/9/pages/rotate', status: 200, body: rotated },
      ]);
      await loaded();

      await user().click(screen.getByRole('button', { name: 'Rotate all left' }));

      await waitFor(() => expect(calls.some((c) => c.path === '/api/chapters/9/pages/rotate')).toBe(true));
      expect(JSON.parse(String(calls.find((c) => c.path.endsWith('/pages/rotate'))!.body))).toEqual({ direction: 'LEFT' });
    });

    it('landscape page asks before translating; cancel does not call translateChapter', async () => {
      const calls = renderPage([
        get({ pages: landscapePages }),
        { method: 'POST', path: '/api/chapters/9/translate', status: 202, body: chapterDetail({ translationStatus: 'TRANSLATING' }) },
      ]);
      await loaded();

      await user().click(screen.getByRole('button', { name: 'Translate again' }));
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog).toHaveAccessibleName('Landscape pages');
      expect(dialog).toHaveTextContent('1 page(s) are landscape — Gemini reads sideways text poorly. Translate anyway?');
      await user().click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

      expect(calls.some((c) => c.path === '/api/chapters/9/translate')).toBe(false);

      await user().click(screen.getByRole('button', { name: 'Translate again' }));
      await answerConfirm('Translate anyway', 'Landscape pages');
      await waitFor(() => expect(calls.some((c) => c.path === '/api/chapters/9/translate')).toBe(true));
    });

    it('suspect pages show warning line "Pages 2, 3 may be incomplete"', async () => {
      const pages = [
        { ...landscapePages[1], id: 10, position: 1, landscape: false },
        { ...landscapePages[1], suspect: true },
        { ...landscapePages[1], id: 13, position: 3, suspect: true },
      ];
      renderPage([get({ pages })]);
      await loaded();

      expect(
        screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Pages 2, 3 may be incomplete'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show page 3' })).toBeInTheDocument();
    });

    it('says "Page 4 may be incomplete" for a single page, also on a published chapter', async () => {
      const pages = [{ ...landscapePages[1], suspect: true }];
      renderPage([get({ pages, publishStatus: 'PUBLISHED' })]);
      await loaded();

      expect(
        screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Page 1 may be incomplete'),
      ).toBeInTheDocument();
    });

    it('badges Landscape and May be incomplete render', async () => {
      const pages = [
        { ...landscapePages[0] },
        { ...landscapePages[1], suspect: true },
      ];
      renderPage([get({ pages })]);
      await loaded();

      expect(screen.getByText('Landscape')).toBeInTheDocument();
      expect(screen.getByText('May be incomplete')).toBeInTheDocument();
    });

    it('shows the AI source in the lightbox and copies it', async () => {
      const u = user();
      // user-event installs its own clipboard on setup, so replace it afterwards.
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      const pages = [{ ...landscapePages[1], source: 'สวัสดี' }];
      renderPage([get({ pages })]);
      await loaded();

      await u.click(screen.getByRole('button', { name: 'Enlarge page 1' }));

      expect((await screen.findAllByText(/Source read by AI:/))[0]).toHaveTextContent('สวัสดี');
      await u.click(screen.getByRole('button', { name: 'Copy source' }));
      expect(writeText).toHaveBeenCalledWith('สวัสดี');
    });
  });
});

describe('ChapterPage translating model', () => {
  afterEach(() => vi.useRealTimers());

  it('says which model is translating', async () => {
    renderPage([get({ translationStatus: 'TRANSLATING', translationModel: 'gemini-x' })]);
    expect(await screen.findByText('Translating with gemini-x…')).toBeInTheDocument();
  });

  it('names no model before one is known', async () => {
    renderPage([get({ translationStatus: 'TRANSLATING', translationModel: null })]);
    expect(await screen.findByText('Gemini is reading and translating the pages…')).toBeInTheDocument();
    expect(screen.queryByText(/Translating with/)).not.toBeInTheDocument();
  });

  it('follows a fallback model while polling', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const routes: FakeRoute[] = [get({ translationStatus: 'TRANSLATING', translationModel: 'a' })];
    renderPage(routes);
    expect(await screen.findByText('Translating with a…')).toBeInTheDocument();

    routes[0] = get({ translationStatus: 'TRANSLATING', translationModel: 'b' });
    await vi.advanceTimersByTimeAsync(3000);

    expect(await screen.findByText('Translating with b…')).toBeInTheDocument();
  });

  it('shows who translated it afterwards, and nothing for old chapters', async () => {
    renderPage([get({ translationModel: 'a, b' })]);
    expect(await screen.findByText('Translated by a, b')).toBeInTheDocument();
  });

  it('shows nothing about the model when it is unknown', async () => {
    renderPage([get()]);
    await loaded();
    expect(screen.queryByText(/Translated by/)).not.toBeInTheDocument();
  });
});

describe('ChapterPage save shortcuts and auto-save', () => {
  const put: FakeRoute = { method: 'PUT', path: '/api/chapters/9', status: 200, body: chapterDetail({ text: 'x' }) };
  const puts = (calls: { method: string }[]) => calls.filter((c) => c.method === 'PUT');
  beforeEach(() => vi.mocked(toast.success).mockClear());
  afterEach(() => vi.useRealTimers());

  const edit = (value = 'đã sửa') => fireEvent.change(textBox(), { target: { value } });
  const ctrlS = (init: KeyboardEventInit = { key: 's', ctrlKey: true }) => {
    const e = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
    act(() => {
      document.dispatchEvent(e);
    });
    return e;
  };

  it('shows a Chapter saved toast after Save', async () => {
    renderPage([get(), put]);
    await loaded();
    edit();
    await user().click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Chapter saved'));
  });

  it('saves on Ctrl+S and Cmd+S with changes, preventing the browser dialog', async () => {
    const calls = renderPage([get(), put]);
    await loaded();
    edit();
    const e = ctrlS();
    expect(e.defaultPrevented).toBe(true);
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Chapter saved'));
    edit('again');
    const e2 = ctrlS({ key: 's', metaKey: true });
    expect(e2.defaultPrevented).toBe(true);
    await waitFor(() => expect(puts(calls)).toHaveLength(2));
  });

  it('does nothing on Ctrl+S without changes', async () => {
    const calls = renderPage([get(), put]);
    await loaded();
    const e = ctrlS();
    expect(e.defaultPrevented).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    expect(puts(calls)).toHaveLength(0);
  });

  it('auto-saves after 3 minutes of unsaved changes with an Auto-saved toast', async () => {
    const calls = renderPage([get(), put]);
    await loaded();
    vi.useFakeTimers();
    edit();
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_MS - 1000));
    expect(puts(calls)).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    vi.useRealTimers();
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(toast.success).toHaveBeenCalledWith('Auto-saved');
    expect(toast.success).not.toHaveBeenCalledWith('Chapter saved');
  });

  it('never auto-saves a clean chapter', async () => {
    const calls = renderPage([get(), put]);
    await loaded();
    vi.useFakeTimers();
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_MS * 2));
    expect(puts(calls)).toHaveLength(0);
  });

  it('sends no request while the chapter is TRANSLATING', async () => {
    const calls = renderPage([get({ translationStatus: 'TRANSLATING' }), put]);
    await screen.findByRole('heading', { level: 1 });
    vi.useFakeTimers();
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_MS * 2));
    expect(puts(calls)).toHaveLength(0);
    ctrlS();
    expect(puts(calls)).toHaveLength(0);
  });

  it('sends no request when the Number is empty', async () => {
    const calls = renderPage([get(), put]);
    await loaded();
    fireEvent.change(screen.getByLabelText('Number'), { target: { value: '' } });
    vi.useFakeTimers();
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_MS * 2));
    ctrlS();
    expect(puts(calls)).toHaveLength(0);
  });

  it('puts Number, Chapter label and Chapter title in one wrapping row', async () => {
    renderPage([get()]);
    await loaded();

    const row = screen.getByLabelText('Number').closest('.chapter-meta__row')!;
    expect(row).not.toBeNull();
    expect(row.contains(screen.getByLabelText('Chapter label (optional)'))).toBe(true);
    expect(row.contains(screen.getByLabelText('Chapter title (optional)'))).toBe(true);
    expect([...row.querySelectorAll(':scope > .field')].map((f) => f.className)).toEqual([
      'field chapter-meta__number',
      'field chapter-meta__label',
      'field chapter-meta__title',
    ]);
    const rule = (name: string) => new RegExp(`\\.chapter-meta__${name}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    expect(/\.chapter-meta__row\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/.test(css)).toBe(true);
    expect(rule('number')).toMatch(/flex:\s*0 0 1\d\dpx/);
    expect(rule('label')).toMatch(/flex:\s*0 0 2[0-4]\dpx/);
    expect(rule('title')).toMatch(/flex:\s*1 1 /);
  });

  it('explains Number and Chapter label with info tooltips instead of hint lines', async () => {
    renderPage([get()]);
    await loaded();
    expect(screen.getByLabelText('Number')).toBeInTheDocument();
    expect(screen.queryByLabelText('Order')).not.toBeInTheDocument();
    expect(screen.queryByText(/Sorts the chapters/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Shown instead of the number/)).not.toBeInTheDocument();
    const info = screen.getByRole('button', { name: 'About Number' });
    await user().hover(info);
    expect((await screen.findAllByText(/Drag chapters in the list to change the reading order\./)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'About Chapter label' })).toBeInTheDocument();
  });
});
