import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerConfirm } from '../test/confirm';
import { pickOption } from '../test/select';
import { fakeFetch, problem } from '../test/fakeFetch';
import { chapterDetail, chapterSummary, notebookView, novelDetail } from '../test/novelFixtures';
import { css } from '../test/css';
import { expectTooltip } from '../test/tooltip';
import NovelPage from './NovelPage';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

function ChapterStub() {
  const { chapterId } = useParams();
  return <p>chapter {chapterId}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/novels/3']}>
      <Routes>
        <Route path="/novels" element={<p>novels list</p>} />
        <Route path="/novels/:id" element={<NovelPage />} />
        <Route path="/novels/:id/chapters/:chapterId" element={<ChapterStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

const getNovel = { method: 'GET', path: '/api/novels/3', status: 200, body: novelDetail() };
const profiles = { method: 'GET', path: '/api/novel-profiles', status: 200, body: { configured: true, profiles: ['SummerLove'] } };

describe('NovelPage', () => {
  it('lists chapters with their translation and publish badges', async () => {
    fakeFetch([getNovel]);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' })).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: 'Chapters' })).getAllByRole('listitem');
    expect(within(rows[0]).getByRole('link', { name: /Chapter 1: Mở đầu/ })).toHaveAttribute('href', '/novels/3/chapters/9');
    expect(within(rows[0]).getByText('Translated')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Published')).toBeInTheDocument();
    expect(within(rows[0]).getByText('3 pages')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Translating…')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Draft')).toBeInTheDocument();
  });

  it('is a hero header: cover before the title, Novels > title breadcrumbs, no back link', async () => {
    fakeFetch([getNovel]);
    renderPage();

    const h1 = await screen.findByRole('heading', { level: 1, name: 'Tình Yêu Mùa Hạ' });
    const header = h1.closest('header')!;
    expect(header).toHaveClass('masthead--hero');
    const cover = header.querySelector('.masthead__media')!;
    expect(cover.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Novels' })).toHaveAttribute('href', '/novels');
    expect(within(nav).getByText('Tình Yêu Mùa Hạ')).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector('.back-link')).toBeNull();
  });

  it('puts Add chapter in the Chapters toolbar, at the standard size and not full width', async () => {
    fakeFetch([getNovel]);
    renderPage();

    const add = await screen.findByRole('button', { name: 'Add chapter' });
    expect(add).toHaveClass('button--primary');
    expect(add.closest('.toolbar')).not.toBeNull();
    expect(add).not.toHaveClass('button--l', 'button--block');
  });

  it('draws chapter rows as divider rows, not a bordered box each', () => {
    const item = /\.chapter-list__item\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(item).not.toMatch(/(^|[;\s])border:/);
    expect(item).toMatch(/border-bottom:\s*1px solid var\(--rule\)/);
  });

  it('loads the novel once while switching tabs', async () => {
    const calls = fakeFetch([getNovel, profiles, { method: 'GET', path: '/api/novels/3/notebook', status: 200, body: notebookView() }]);
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

    await user.click(screen.getByRole('tab', { name: 'Details' }));
    await user.click(screen.getByRole('tab', { name: 'Notebook' }));
    await user.click(screen.getByRole('tab', { name: 'Chapters' }));

    expect(calls.filter((c) => c.path === '/api/novels/3')).toHaveLength(1);
  });

  it('adds a chapter and opens it', async () => {
    const calls = fakeFetch([
      getNovel,
      { method: 'POST', path: '/api/novels/3/chapters', status: 201, body: chapterDetail({ id: 44, chapterNo: 3 }) },
    ]);
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Add chapter' }));

    expect(await screen.findByText('chapter 44')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')!.body).toBe('{}');
  });

  it('saves details', async () => {
    const calls = fakeFetch([
      getNovel,
      profiles,
      { method: 'PUT', path: '/api/novels/3', status: 200, body: novelDetail({ title: 'Mới' }) },
    ]);
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

    await user.click(screen.getByRole('tab', { name: 'Details' }));
    const title = screen.getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Mới');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('heading', { name: 'Mới' })).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Novel saved');
    const sent = JSON.parse(calls.find((c) => c.method === 'PUT')!.body as string);
    expect(sent).toMatchObject({ title: 'Mới', slug: 'summer-love', tags: ['romance', 'BL'] });
  });

  describe('trailer field', () => {
    const withTrailer = { ...getNovel, body: novelDetail({ trailerVideoId: 'dQw4w9WgXcQ' }) };

    async function openDetails(routes: Parameters<typeof fakeFetch>[0]) {
      const calls = fakeFetch(routes);
      renderPage();
      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
      await userEvent.setup().click(screen.getByRole('tab', { name: 'Details' }));
      return calls;
    }

    it('shows the stored trailer as a youtu.be link', async () => {
      await openDetails([withTrailer, profiles]);

      expect(screen.getByLabelText('Trailer (YouTube link, optional)')).toHaveValue('https://youtu.be/dQw4w9WgXcQ');
    });

    it('is empty without a trailer', async () => {
      await openDetails([getNovel, profiles]);

      expect(screen.getByLabelText('Trailer (YouTube link, optional)')).toHaveValue('');
    });

    it('clears the trailer when the field is emptied (sent as null)', async () => {
      const user = userEvent.setup();
      const calls = fakeFetch([
        withTrailer,
        profiles,
        { method: 'PUT', path: '/api/novels/3', status: 200, body: novelDetail({ trailerVideoId: null }) },
      ]);
      renderPage();
      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
      await user.click(screen.getByRole('tab', { name: 'Details' }));

      await user.clear(screen.getByLabelText('Trailer (YouTube link, optional)'));
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
      expect(JSON.parse(calls.find((c) => c.method === 'PUT')!.body as string).trailerUrl).toBeNull();
      await waitFor(() => expect(screen.getByLabelText('Trailer (YouTube link, optional)')).toHaveValue(''));
    });

    it('shows the saved trailer as a youtu.be link after pasting another form of it', async () => {
      const user = userEvent.setup();
      const calls = fakeFetch([
        getNovel,
        profiles,
        { method: 'PUT', path: '/api/novels/3', status: 200, body: novelDetail({ trailerVideoId: 'dQw4w9WgXcQ' }) },
      ]);
      renderPage();
      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
      await user.click(screen.getByRole('tab', { name: 'Details' }));

      await user.type(screen.getByLabelText('Trailer (YouTube link, optional)'), 'https://www.youtube.com/shorts/dQw4w9WgXcQ');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(screen.getByLabelText('Trailer (YouTube link, optional)')).toHaveValue('https://youtu.be/dQw4w9WgXcQ'));
      expect(JSON.parse(calls.find((c) => c.method === 'PUT')!.body as string).trailerUrl).toBe(
        'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      );
    });
  });

  it('Details has one sticky bar with Delete novel at its start and no separate delete block', async () => {
    fakeFetch([getNovel, profiles]);
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

    await user.click(screen.getByRole('tab', { name: 'Details' }));

    const bar = screen.getByRole('button', { name: 'Save' }).closest('.form-actions')!;
    expect(bar).toHaveClass('form-actions--sticky');
    expect(bar.querySelector('.form-actions__start')).toContainElement(screen.getByRole('button', { name: 'Delete novel' }));
    expect(document.querySelector('.danger-zone')).toBeNull();
  });

  it('deletes the novel after confirming', async () => {
    const calls = fakeFetch([getNovel, profiles, { method: 'DELETE', path: '/api/novels/3', status: 204 }]);
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

    await user.click(screen.getByRole('tab', { name: 'Details' }));
    await user.click(screen.getByRole('button', { name: 'Delete novel' }));
    await answerConfirm('Delete', 'Delete the novel "Tình Yêu Mùa Hạ"?');

    expect(await screen.findByText('novels list')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('shows the notebook and switches versions', async () => {
    const calls = fakeFetch([
      getNovel,
      { method: 'GET', path: '/api/novels/3/notebook', status: 200, body: notebookView() },
      { method: 'GET', path: '/api/novels/3/notebook?after=2', status: 200, body: notebookView({ afterChapterNo: 2, staleLaterVersions: true }) },
    ]);
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

    await user.click(screen.getByRole('tab', { name: 'Notebook' }));

    expect(await screen.findByRole('heading', { name: 'Characters' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Glossary & addressing' })).toBeInTheDocument();
    expect(screen.getByText('Mai gọi Nam là anh, xưng em')).toBeInTheDocument();
    expect(screen.getByText('đang buồn')).toBeInTheDocument();
    expect(screen.getByText('Chapter 5:')).toBeInTheDocument();

    await pickOption(user, screen.getByLabelText('Version'), 'After chapter 2');

    await waitFor(() => expect(calls.some((c) => c.path === '/api/novels/3/notebook?after=2')).toBe(true));
    expect(await screen.findByText('Notebook versions after chapter 2 were built from an older text.')).toBeInTheDocument();
  });

  it('names notebook chapters by their label', async () => {
    const labelled = novelDetail({ chapters: [chapterSummary({ id: 20, chapterNo: 5, label: 'Ngoại truyện 1' })] });
    fakeFetch([
      { method: 'GET', path: '/api/novels/3', status: 200, body: labelled },
      { method: 'GET', path: '/api/novels/3/notebook', status: 200, body: notebookView() },
    ]);
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

    await user.click(screen.getByRole('tab', { name: 'Notebook' }));

    expect(await screen.findByText('Ngoại truyện 1:')).toBeInTheDocument();
  });

  it('shows a failed notebook update and retries it', async () => {
    const calls = fakeFetch([
      getNovel,
      {
        method: 'GET',
        path: '/api/novels/3/notebook',
        status: 200,
        body: notebookView({ status: 'FAILED', error: 'Gemini free quota is used up, try again later.' }),
      },
      { method: 'POST', path: '/api/novels/3/notebook/retry', status: 202 },
    ]);
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

    await user.click(screen.getByRole('tab', { name: 'Notebook' }));
    expect(await screen.findByText('Gemini free quota is used up, try again later.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry notebook update' }));

    await waitFor(() => expect(calls.some((c) => c.path === '/api/novels/3/notebook/retry')).toBe(true));
  });

  it('explains an empty notebook', async () => {
    fakeFetch([
      getNovel,
      {
        method: 'GET',
        path: '/api/novels/3/notebook',
        status: 200,
        body: notebookView({ afterChapterNo: null, content: null, versions: [] }),
      },
    ]);
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

    await user.click(screen.getByRole('tab', { name: 'Notebook' }));

    expect(await screen.findByText('The notebook fills in after you publish the first chapter.')).toBeInTheDocument();
  });

  it('chapter list shows a warning icon and 2 for suspectPages 2', async () => {
    fakeFetch([
      {
        ...getNovel,
        body: novelDetail({ chapters: [chapterSummary({ suspectPages: 2 }), chapterSummary({ id: 10, chapterNo: 2 })] }),
      },
    ]);
    renderPage();

    const rows = within(await screen.findByRole('list', { name: 'Chapters' })).getAllByRole('listitem');
    const badge = within(rows[0]).getByLabelText('2 page(s) may be incomplete');
    expect(badge).toHaveTextContent('2');
    expect(badge.querySelector('svg')).not.toBeNull();
    expect(within(rows[1]).queryByLabelText(/may be incomplete/)).not.toBeInTheDocument();
  });

  it('shows the translating model as a tooltip on the Translated badge', async () => {
    const chapters = [
      { ...chapterSummary(), translationModel: 'gemini-x' },
      { ...chapterSummary({ id: 10, chapterNo: 2 }), translationModel: null },
    ];
    fakeFetch([{ ...getNovel, body: novelDetail({ chapters }) }]);
    renderPage();
    const rows = within(await screen.findByRole('list', { name: 'Chapters' })).getAllByRole('listitem');

    await userEvent.setup().hover(within(rows[0]).getByText('Translated'));

    expect((await screen.findAllByText('Translated by gemini-x')).length).toBeGreaterThan(0);
    await userEvent.setup().hover(within(rows[1]).getByText('Translated'));
    expect(screen.queryByText(/Translated by null/)).not.toBeInTheDocument();
  });

  describe('chapter reading order', () => {
    const order = (ids: number[]) => ({
      method: 'PUT',
      path: '/api/novels/3/chapters/order',
      status: 200,
      body: ids.map((id) => ({ ...novelDetail().chapters.find((c) => c.id === id)! })),
    });
    const titles = () =>
      within(screen.getByRole('list', { name: 'Chapters' })).getAllByRole('listitem').map((r) => r.textContent);
    const sent = (calls: { method: string; body?: BodyInit | null }[]) =>
      JSON.parse(String(calls.find((c) => c.method === 'PUT')!.body));

    it('moves a chapter up with the button', async () => {
      const calls = fakeFetch([getNovel, order([10, 9])]);
      renderPage();
      const user = userEvent.setup();
      const rows = within(await screen.findByRole('list', { name: 'Chapters' })).getAllByRole('listitem');
      expect(within(rows[0]).getByRole('button', { name: /^Move up/ })).toBeDisabled();
      expect(within(rows[1]).getByRole('button', { name: /^Move down/ })).toBeDisabled();

      await user.click(within(rows[1]).getByRole('button', { name: /^Move up/ }));

      await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
      expect(sent(calls)).toEqual({ chapterIds: [10, 9] });
      await waitFor(() => expect(titles()[0]).toMatch(/Chapter 2/));
    });

    it('moves a chapter down with the button', async () => {
      const calls = fakeFetch([getNovel, order([10, 9])]);
      renderPage();
      const user = userEvent.setup();
      const rows = within(await screen.findByRole('list', { name: 'Chapters' })).getAllByRole('listitem');

      await user.click(within(rows[0]).getByRole('button', { name: /^Move down/ }));

      await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
      expect(sent(calls)).toEqual({ chapterIds: [10, 9] });
    });

    it('puts the list back and shows the error when saving the order fails', async () => {
      fakeFetch([getNovel, { method: 'PUT', path: '/api/novels/3/chapters/order', status: 400, body: problem(400, 'INVALID_CHAPTER', 'x') }]);
      renderPage();
      const user = userEvent.setup();
      const rows = within(await screen.findByRole('list', { name: 'Chapters' })).getAllByRole('listitem');

      await user.click(within(rows[1]).getByRole('button', { name: /^Move up/ }));

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(titles()[0]).toMatch(/Chapter 1/);
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

      it('saves the order after a keyboard drag', async () => {
        const calls = fakeFetch([getNovel, order([10, 9])]);
        renderPage();
        await screen.findByRole('list', { name: 'Chapters' });
        const handle = screen.getAllByRole('button', { name: /^Drag to reorder/ })[0];

        const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));
        handle.focus();
        fireEvent.keyDown(handle, { key: ' ', code: 'Space' });
        await tick();
        fireEvent.keyDown(document.activeElement ?? handle, { key: 'ArrowDown', code: 'ArrowDown' });
        await tick();
        fireEvent.keyDown(document.activeElement ?? handle, { key: ' ', code: 'Space' });

        await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
        expect(sent(calls)).toEqual({ chapterIds: [10, 9] });
      });
    });
  });

  describe('Wattpad novels', () => {
    const wattpadNovel = novelDetail({ sourceType: 'WATTPAD', sourceLanguage: 'en', wattpadStoryId: '396487502', chapters: [chapterSummary({ pageCount: 0 })] });
    const getWattpad = { method: 'GET', path: '/api/novels/3', status: 200, body: wattpadNovel };
    const parts = { method: 'GET', path: '/api/novels/3/wattpad/parts', status: 200, body: [] };

    it('has no Wattpad tab for a screenshot novel, which keeps Add chapter and has no Fetch & translate next', async () => {
      fakeFetch([getNovel]);
      renderPage();

      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
      expect(screen.queryByRole('tab', { name: 'Wattpad' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add chapter' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Fetch & translate next' })).not.toBeInTheDocument();
    });

    it('shows the Wattpad tab and says Wattpad text instead of 0 pages', async () => {
      fakeFetch([getWattpad, parts]);
      renderPage();

      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
      expect(screen.getByRole('tab', { name: 'Wattpad' })).toBeInTheDocument();
      expect(screen.getByText('Wattpad text')).toBeInTheDocument();
      expect(screen.queryByText('0 pages')).not.toBeInTheDocument();
    });

    it('puts Fetch & translate next in the Chapters toolbar instead of Add chapter', async () => {
      fakeFetch([getWattpad, parts]);
      renderPage();

      const next = await screen.findByRole('button', { name: 'Fetch & translate next' });
      expect(next).toHaveClass('button--primary');
      expect(next.closest('.toolbar')).not.toBeNull();
      expect(screen.queryByRole('button', { name: 'Add chapter' })).not.toBeInTheDocument();
    });

    it('starts the next part from the Chapters tab and opens the new chapter', async () => {
      const calls = fakeFetch([
        getWattpad,
        parts,
        { method: 'POST', path: '/api/novels/3/wattpad/next/fetch-translate', status: 202,
          body: chapterDetail({ id: 61, title: 'Chương mới', translationStatus: 'TRANSLATING' }) },
      ]);
      renderPage();

      await userEvent.setup().click(await screen.findByRole('button', { name: 'Fetch & translate next' }));

      expect(await screen.findByText('chapter 61')).toBeInTheDocument();
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
      expect(toast.info).toHaveBeenCalledWith('Translation started', { description: 'Chương mới' });
    });

    it('shows the error and stays when nothing is left to translate', async () => {
      fakeFetch([
        getWattpad,
        parts,
        { method: 'POST', path: '/api/novels/3/wattpad/next/fetch-translate', status: 409,
          body: problem(409, 'WATTPAD_NOTHING_NEXT', 'x') },
      ]);
      renderPage();

      await userEvent.setup().click(await screen.findByRole('button', { name: 'Fetch & translate next' }));

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(screen.getByRole('button', { name: 'Fetch & translate next' })).toBeEnabled();
    });

    it('opens on the Wattpad tab with ?tab=wattpad and loads the parts', async () => {
      const calls = fakeFetch([getWattpad, parts]);
      render(
        <MemoryRouter initialEntries={['/novels/3?tab=wattpad']}>
          <Routes>
            <Route path="/novels/:id" element={<NovelPage />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(await screen.findByRole('region', { name: 'Wattpad chapters' })).toBeInTheDocument();
      expect(calls.some((c) => c.path === '/api/novels/3/wattpad/parts')).toBe(true);
    });

    it('lets the admin change the source language in Details', async () => {
      const calls = fakeFetch([getWattpad, parts, profiles, { method: 'PUT', path: '/api/novels/3', status: 200, body: wattpadNovel }]);
      renderPage();
      const user = userEvent.setup();
      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

      await user.click(screen.getByRole('tab', { name: 'Details' }));
      expect(screen.getByLabelText('Source language')).toHaveTextContent('English');
      await pickOption(user, screen.getByLabelText('Source language'), 'Thai');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
      expect(JSON.parse(calls.find((c) => c.method === 'PUT')!.body as string).sourceLanguage).toBe('th');
    });

    it('fetches and translates a part and refreshes the chapter list', async () => {
      const calls = fakeFetch([
        getWattpad,
        { ...parts, body: [{ partId: '1', title: 'PROLOGUE', wordCount: 190, createdAt: null, modifiedAt: null, deleted: false, importedChapterId: null }] },
        { method: 'POST', path: '/api/novels/3/wattpad/parts/1/fetch-translate', status: 202, body: {} },
      ]);
      renderPage();
      const user = userEvent.setup();
      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

      await user.click(screen.getByRole('tab', { name: 'Wattpad' }));
      await user.click(await screen.findByRole('button', { name: /Fetch & translate PROLOGUE/ }));

      await waitFor(() => expect(calls.filter((c) => c.path === '/api/novels/3')).toHaveLength(2));
    });

    it('polls the novel, never the Wattpad parts, while a chapter translates', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const busy = novelDetail({
          sourceType: 'WATTPAD',
          sourceLanguage: 'en',
          wattpadStoryId: '396487502',
          chapters: [chapterSummary({ pageCount: 0, translationStatus: 'TRANSLATING' })],
        });
        const calls = fakeFetch([{ ...getWattpad, body: busy }, parts]);
        renderPage();
        await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
        const novelCalls = () => calls.filter((c) => c.path === '/api/novels/3').length;
        const before = novelCalls();

        await vi.advanceTimersByTimeAsync(6500);

        expect(novelCalls()).toBeGreaterThanOrEqual(before + 2);
        expect(calls.filter((c) => c.path.endsWith('/wattpad/parts'))).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe('NovelPage busy novel', () => {
  const wattpad = (over: Partial<ReturnType<typeof novelDetail>> = {}) =>
    novelDetail({
      sourceType: 'WATTPAD',
      sourceLanguage: 'en',
      wattpadStoryId: '1',
      chapters: [chapterSummary({ id: 9, chapterNo: 24, pageCount: 0, publishStatus: 'PUBLISHED', translationStatus: 'TRANSLATED' })],
      ...over,
    });
  const route = (body: unknown) => ({ method: 'GET', path: '/api/novels/3', status: 200, body });
  const parts = { method: 'GET', path: '/api/novels/3/wattpad/parts', status: 200, body: [] };
  const next = () => screen.getByRole('button', { name: 'Fetch & translate next' });
  const line = () => screen.queryByText(/Notebook updating|is translating…/, { selector: '.novel-busy' });

  it('shows the notebook line and disables Fetch & translate next, with the reason in a tooltip', async () => {
    fakeFetch([route(wattpad({ notebookStatus: 'UPDATING', notebookChapterNo: 24 })), parts]);
    renderPage();
    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

    expect(line()).toHaveTextContent('Notebook updating after chapter 24…');
    expect(next()).toBeDisabled();
    await expectTooltip(next().parentElement!, 'The notebook is still updating after chapter 24');
  });

  it('shows the translating chapter and the reason when a chapter translates', async () => {
    const busy = wattpad({
      chapters: [chapterSummary({ id: 10, chapterNo: 25, pageCount: 0, translationStatus: 'TRANSLATING', publishStatus: 'DRAFT' })],
    });
    fakeFetch([route(busy), parts]);
    renderPage();
    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

    expect(line()).toHaveTextContent('Chapter 25 is translating…');
    expect(next()).toBeDisabled();
    await expectTooltip(next().parentElement!, 'Chapter 25 is still translating');
  });

  it('a failed notebook shows no line and disables nothing', async () => {
    fakeFetch([route(wattpad({ notebookStatus: 'FAILED', notebookError: 'x' })), parts]);
    renderPage();
    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

    expect(line()).toBeNull();
    expect(next()).toBeEnabled();
  });

  it('polls while the notebook updates, then drops the line and re-enables the button', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const routes = [route(wattpad({ notebookStatus: 'UPDATING' })), parts];
      const calls = fakeFetch(routes);
      renderPage();
      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
      expect(line()).not.toBeNull();
      const before = calls.filter((c) => c.path === '/api/novels/3').length;

      await vi.advanceTimersByTimeAsync(3500);
      expect(calls.filter((c) => c.path === '/api/novels/3').length).toBeGreaterThan(before);
      expect(line()).not.toBeNull();

      routes[0] = route(wattpad({ notebookStatus: 'IDLE' }));
      await vi.advanceTimersByTimeAsync(3500);

      await waitFor(() => expect(line()).toBeNull());
      expect(next()).toBeEnabled();
      const after = calls.filter((c) => c.path === '/api/novels/3').length;
      await vi.advanceTimersByTimeAsync(7000);
      expect(calls.filter((c) => c.path === '/api/novels/3').length).toBe(after); // idle: polling stopped
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('NovelPage notebook pause', () => {
  const notebookRoute = (over = {}) => ({
    method: 'GET',
    path: '/api/novels/3/notebook',
    status: 200,
    body: notebookView(over),
  });
  const pausePut = { method: 'PUT', path: '/api/novels/3/notebook/paused', status: 200 };
  const published = (chapterNo: number, id = chapterNo) =>
    chapterSummary({ id, chapterNo, publishStatus: 'PUBLISHED', translationStatus: 'TRANSLATED' });

  async function openNotebook() {
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
    await user.click(screen.getByRole('tab', { name: 'Notebook' }));
    return user;
  }

  it('the switch calls the PUT, shows the header badge and keeps the version on screen', async () => {
    const calls = fakeFetch([
      getNovel,
      notebookRoute(),
      { ...pausePut, body: notebookView({ notebookPaused: true, afterChapterNo: 9 }) },
    ]);
    const user = await openNotebook();
    const toggle = await screen.findByRole('switch', { name: 'Pause notebook updates' });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByText('Notebook paused')).toBeNull();

    await user.click(toggle);

    expect(toggle).toBeChecked();
    expect(screen.getByText('Notebook paused')).toBeInTheDocument();
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(JSON.parse(put.body as string)).toEqual({ paused: true });
    expect(screen.getByText('Mai gặp Nam.')).toBeInTheDocument();
  });

  it('rolls the switch back and shows an error toast when saving fails', async () => {
    fakeFetch([getNovel, notebookRoute(), { ...pausePut, status: 500, body: problem(500, 'X', 'boom') }]);
    const user = await openNotebook();
    const toggle = await screen.findByRole('switch', { name: 'Pause notebook updates' });

    await user.click(toggle);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toggle).not.toBeChecked();
    expect(screen.queryByText('Notebook paused')).toBeNull();
  });

  it('shows the badge from the novel and checks the switch', async () => {
    fakeFetch([{ ...getNovel, body: novelDetail({ notebookPaused: true }) }, notebookRoute({ notebookPaused: true })]);
    await openNotebook();

    expect(screen.getByText('Notebook paused')).toBeInTheDocument();
    expect(await screen.findByRole('switch', { name: 'Pause notebook updates' })).toBeChecked();
    expect(screen.getByText(/Publishing will not update the notebook/)).toBeInTheDocument();
  });

  it('disables Retry with its reason while paused', async () => {
    fakeFetch([
      { ...getNovel, body: novelDetail({ notebookPaused: true }) },
      notebookRoute({ status: 'FAILED', error: 'x', notebookPaused: true }),
    ]);
    await openNotebook();

    const retry = await screen.findByRole('button', { name: 'Retry notebook update' });
    expect(retry).toBeDisabled();
    await expectTooltip(retry.parentElement!, 'Notebook updates are paused');
  });

  it('says how far behind the notebook is after resuming and updates on demand', async () => {
    const calls = fakeFetch([
      { ...getNovel, body: novelDetail({ chapters: [published(5), published(8)] }) },
      notebookRoute({ versions: [2, 5] }),
      { method: 'POST', path: '/api/novels/3/notebook/retry', status: 202 },
    ]);
    const user = await openNotebook();

    expect(
      await screen.findByText('The notebook was last updated after chapter 5; chapters 6–8 were published since.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Update now' }));

    await waitFor(() => expect(calls.some((c) => c.path === '/api/novels/3/notebook/retry')).toBe(true));
    expect(await screen.findByText('Updating notebook…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update now' })).toBeNull();
  });

  it('words a single missing chapter in the singular', async () => {
    fakeFetch([{ ...getNovel, body: novelDetail({ chapters: [published(6)] }) }, notebookRoute({ versions: [2, 5] })]);
    await openNotebook();

    expect(
      await screen.findByText('The notebook was last updated after chapter 5; chapter 6 was published since.'),
    ).toBeInTheDocument();
  });

  it('shows neither the line nor Update now when the notebook is up to date', async () => {
    fakeFetch([{ ...getNovel, body: novelDetail({ chapters: [published(5)] }) }, notebookRoute({ versions: [2, 5] })]);
    await openNotebook();

    await screen.findByRole('switch', { name: 'Pause notebook updates' });
    expect(screen.queryByText(/were published since|was published since/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Update now' })).toBeNull();
  });

  it('shows neither the line nor Update now while paused', async () => {
    fakeFetch([
      { ...getNovel, body: novelDetail({ notebookPaused: true, chapters: [published(8)] }) },
      notebookRoute({ versions: [2, 5], notebookPaused: true }),
    ]);
    await openNotebook();

    await screen.findByRole('switch', { name: 'Pause notebook updates' });
    expect(screen.queryByRole('button', { name: 'Update now' })).toBeNull();
  });
});
