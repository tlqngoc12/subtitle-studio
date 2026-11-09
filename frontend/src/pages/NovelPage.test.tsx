import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerConfirm } from '../test/confirm';
import { fakeFetch, problem } from '../test/fakeFetch';
import { chapterDetail, chapterSummary, notebookView, novelDetail } from '../test/novelFixtures';
import NovelPage from './NovelPage';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: { success: vi.fn(), error: vi.fn() } }));

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

    await user.selectOptions(screen.getByLabelText('Version'), '2');

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

  it('chapter list shows ⚠ 2 for suspectPages 2', async () => {
    fakeFetch([
      {
        ...getNovel,
        body: novelDetail({ chapters: [chapterSummary({ suspectPages: 2 }), chapterSummary({ id: 10, chapterNo: 2 })] }),
      },
    ]);
    renderPage();

    const rows = within(await screen.findByRole('list', { name: 'Chapters' })).getAllByRole('listitem');
    expect(within(rows[0]).getByText('⚠ 2')).toHaveAccessibleName('2 page(s) may be incomplete');
    expect(within(rows[1]).queryByText(/⚠/)).not.toBeInTheDocument();
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
});
