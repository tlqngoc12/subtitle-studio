import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerConfirm } from '../test/confirm';
import { pickOption } from '../test/select';
import { fakeFetch, problem } from '../test/fakeFetch';
import { chapterDetail, chapterSummary, novelDetail } from '../test/novelFixtures';
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
  it('shows a Novel not found page with breadcrumbs and a link back when the novel does not exist', async () => {
    fakeFetch([{ method: 'GET', path: '/api/novels/3', status: 404, body: problem(404, 'NOVEL_NOT_FOUND', 'x') }]);
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Novel not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All novels' })).toHaveAttribute('href', '/novels');
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Not found')).toBeInTheDocument();
  });

  it('lists chapters with their translation and publish badges', async () => {
    fakeFetch([getNovel]);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' })).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: 'Chapters' })).getAllByRole('listitem');
    expect(within(rows[0]).getByRole('link', { name: /Chapter 1: Mở đầu/ })).toHaveAttribute('href', '/novels/3/chapters/9');
    expect(within(rows[0]).getByLabelText('Translated')).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText('Published')).toBeInTheDocument();
    expect(within(rows[0]).getByLabelText('3 pages')).toBeInTheDocument();
    expect(within(rows[1]).getByLabelText('Translating…')).toBeInTheDocument();
    expect(within(rows[1]).getByLabelText('Draft')).toBeInTheDocument();
    expect(within(rows[0]).queryByText('Published')).not.toBeInTheDocument();
  });

  it('keeps a chapter row on one line: the name is its own truncating title, with the full name in a tooltip', async () => {
    const long = '<b>Rất dài</b> 🌧 บทที่ยาวมาก '.repeat(8);
    fakeFetch([{ ...getNovel, body: novelDetail({ chapters: [chapterSummary({ title: long, pageCount: 12 })] }) }]);
    renderPage();
    const row = within(await screen.findByRole('list', { name: 'Chapters' })).getAllByRole('listitem')[0];

    const title = row.querySelector('.chapter-list__title')!;
    expect(title).toHaveTextContent('<b>Rất dài</b>');
    expect(within(row).getByLabelText('12 pages')).toBeInTheDocument();
    await userEvent.setup().hover(title);
    expect((await screen.findAllByText(new RegExp('<b>Rất dài</b>'))).length).toBeGreaterThan(0);
    expect(css).toMatch(/\.chapter-list__title\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(css).toMatch(/\.chapter-list__open\s*\{[^}]*flex-wrap:\s*nowrap/);
  });

  it('profileTabOpensFromQuery', async () => {
    const calls = fakeFetch([
      getNovel,
      { method: 'GET', path: '/api/novels/3/profile', status: 200, body: {
        name: 'SummerLove', text: '## Xưng hô', sha: 's', geminiConfigured: true,
        stats: { chapters: 1, edits: 2, otherNovels: [] },
      } },
    ]);
    render(
      <MemoryRouter initialEntries={['/novels/3?tab=profile']}>
        <Routes>
          <Route path="/novels/:id" element={<NovelPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('tab', { name: 'Profile', selected: true })).toBeInTheDocument();
    expect(await screen.findByText('SummerLove.md')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/novels/3/profile')).toBe(true);
    const tabs = within(screen.getByRole('tablist', { name: 'Novel sections' })).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent).slice(-2)).toEqual(['Details', 'Profile']);
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
    expect(within(nav).getByRole('link', { name: 'Translated' })).toHaveAttribute('href', '/novels?tab=translated');
    expect(within(nav).getByText('Tình Yêu Mùa Hạ')).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector('.back-link')).toBeNull();
  });

  it('lists an original story under Originals', async () => {
    fakeFetch([{ ...getNovel, body: novelDetail({ sourceType: 'ORIGINAL' }) }]);
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Tình Yêu Mùa Hạ' });
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Originals' })).toHaveAttribute('href', '/novels?tab=originals');
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
    const calls = fakeFetch([getNovel, profiles]);
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

    await user.click(screen.getByRole('tab', { name: 'Details' }));
    await user.click(screen.getByRole('tab', { name: 'Chapters' }));

    expect(calls.filter((c) => c.path === '/api/novels/3')).toHaveLength(1);
  });

  it('unknown_tab_param_shows_default_tab', async () => {
    fakeFetch([getNovel]);
    render(
      <MemoryRouter initialEntries={['/novels/3?tab=notebook']}>
        <Routes>
          <Route path="/novels/:id" element={<NovelPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('tab', { name: 'Chapters', selected: true })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Notebook' })).toBeNull();
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

  describe('an original story', () => {
    const story = novelDetail({
      sourceType: 'ORIGINAL',
      sourceLanguage: 'vi',
      translatorCredit: null,
      sourceUrl: null,
      originalAuthor: 'EmiBonnie',
      chapters: [chapterSummary({ translationStatus: 'NONE', pageCount: 0, publishStatus: 'DRAFT' })],
    });
    const getStory = { method: 'GET', path: '/api/novels/3', status: 200, body: story };

    it('originalNovelHasNoWattpadTab: Chapters, Details, Profile and no translation chip or page count', async () => {
      fakeFetch([getStory]);
      renderPage();
      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

      const tabs = within(screen.getByRole('tablist', { name: 'Novel sections' })).getAllByRole('tab');
      expect(tabs.map((t) => t.textContent)).toEqual(['Chapters', 'Details', 'Profile']);
      const row = within(screen.getByRole('list', { name: 'Chapters' })).getAllByRole('listitem')[0];
      expect(within(row).getByLabelText('Draft')).toBeInTheDocument();
      expect(within(row).queryByLabelText('Not translated')).not.toBeInTheDocument();
      expect(within(row).queryByLabelText(/page/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Fetch & translate next/ })).not.toBeInTheDocument();
    });

    it('addChapterCreatesTextChapter: Add chapter posts an empty chapter and opens it', async () => {
      const calls = fakeFetch([
        getStory,
        { method: 'POST', path: '/api/novels/3/chapters', status: 201, body: chapterDetail({ id: 44, sourceType: 'ORIGINAL' }) },
      ]);
      renderPage();
      const user = userEvent.setup();
      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

      await user.click(screen.getByRole('button', { name: 'Chapter actions' }));
      await user.click(screen.getByRole('button', { name: 'Add chapter' }));

      expect(await screen.findByText('chapter 44')).toBeInTheDocument();
      expect(calls.find((c) => c.method === 'POST')!.body).toBe('{}');
    });

    it('chapterActionsMenu: one ⋯ button replaces Export and Add chapter, with Sync, Add chapter, Export in order', async () => {
      fakeFetch([{ ...getStory, body: { ...story, wattpadStoryId: '396487502' } }]);
      renderPage();
      const user = userEvent.setup();
      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

      const toolbar = document.querySelector('.toolbar') as HTMLElement;
      expect(within(toolbar).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Chapter actions']);
      await user.click(screen.getByRole('button', { name: 'Chapter actions' }));

      const labels = screen.getAllByRole('button').map((b) => b.textContent).filter(Boolean);
      expect(labels.slice(-3)).toEqual(['Sync with Wattpad', 'Add chapter', 'Export']);
      expect(screen.getByRole('button', { name: 'Sync with Wattpad' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled();
    });

    it('chapterActionsMenu: Sync is off with the reason when the story has no Wattpad link', async () => {
      fakeFetch([getStory]);
      renderPage();
      const user = userEvent.setup();
      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

      await user.click(screen.getByRole('button', { name: 'Chapter actions' }));

      const sync = screen.getByRole('button', { name: 'Sync with Wattpad' });
      expect(sync).toBeDisabled();
      await expectTooltip(sync.parentElement!, 'Add a Wattpad link in Details to sync.');
    });

    it('chapterActionsMenu: Export is off while the story has no chapters', async () => {
      fakeFetch([{ ...getStory, body: { ...story, chapters: [] } }]);
      renderPage();
      const user = userEvent.setup();
      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

      await user.click(screen.getByRole('button', { name: 'Chapter actions' }));

      expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Add chapter' })).toBeEnabled();
    });

    it('other kinds keep the toolbar: no ⋯ menu', async () => {
      fakeFetch([getNovel]);
      renderPage();
      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

      expect(screen.queryByRole('button', { name: 'Chapter actions' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    });

    it('editOriginalKeepsKind: the form asks for no source fields and saves as ORIGINAL', async () => {
      const calls = fakeFetch([
        getStory,
        profiles,
        { method: 'PUT', path: '/api/novels/3', status: 200, body: { ...story, title: 'Mới' } },
      ]);
      renderPage();
      const user = userEvent.setup();
      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

      await user.click(screen.getByRole('tab', { name: 'Details' }));
      expect(screen.getByLabelText('Author')).toHaveValue('EmiBonnie');
      expect(screen.queryByLabelText('Source language')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Translator credit (optional)')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Original book link (optional)')).not.toBeInTheDocument();
      const title = screen.getByLabelText('Title');
      await user.clear(title);
      await user.type(title, 'Mới');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByRole('heading', { name: 'Mới' })).toBeInTheDocument();
      const sent = JSON.parse(calls.find((c) => c.method === 'PUT')!.body as string);
      expect(sent).toMatchObject({ sourceType: 'ORIGINAL', originalAuthor: 'EmiBonnie', translatorCredit: null, sourceUrl: null });
      expect(sent).not.toHaveProperty('sourceLanguage');
    });
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

  describe('profile follows the title', () => {
    const renamedProfiles = { ...profiles, body: { configured: true, profiles: ['SummerLove', 'Unknown', 'MuaHe'] } };

    async function saveTitle(putBody: unknown, profile: string) {
      fakeFetch([
        { ...getNovel, body: novelDetail({ promptProfile: profile }) },
        renamedProfiles,
        { method: 'PUT', path: '/api/novels/3', status: 200, body: putBody },
      ]);
      renderPage();
      const user = userEvent.setup();
      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
      await user.click(screen.getByRole('tab', { name: 'Details' }));
      const title = screen.getByLabelText('Title');
      await user.clear(title);
      await user.type(title, 'Mua He');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Novel saved'));
    }

    it('toasts when the profile was renamed', async () => {
      await saveTitle(novelDetail({ title: 'Mua He', promptProfile: 'MuaHe' }), 'Unknown');

      expect(toast.info).toHaveBeenCalledWith('Profile renamed to MuaHe.md');
    });

    it('no toast when the user picked another profile', async () => {
      await saveTitle(novelDetail({ title: 'Mua He', promptProfile: 'Unknown' }), 'Unknown');

      expect(toast.info).not.toHaveBeenCalled();
    });
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

    await userEvent.setup().hover(within(rows[0]).getByLabelText('Translated by gemini-x'));

    expect((await screen.findAllByText('Translated by gemini-x')).length).toBeGreaterThan(0);
    await userEvent.setup().hover(within(rows[1]).getByLabelText('Translated'));
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
      expect(screen.getByLabelText('Wattpad text')).toBeInTheDocument();
      expect(screen.queryByLabelText('0 pages')).not.toBeInTheDocument();
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

describe('NovelPage export', () => {
  const exportRoute = {
    method: 'GET',
    path: '/api/novels/3/export',
    status: 200,
    body: 'zip',
    headers: { 'Content-Disposition': 'attachment; filename="summer-love-2026-11-18.zip"' },
  };

  afterEach(() => vi.restoreAllMocks());

  it('exports the chapters', async () => {
    let release!: () => void;
    const delay = new Promise<void>((resolve) => (release = resolve));
    const calls = fakeFetch([getNovel, { ...exportRoute, delay }]);
    const create = vi.fn(() => 'blob:zip');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    renderPage();
    const user = userEvent.setup();

    const button = await screen.findByRole('button', { name: 'Export' });
    expect(button.querySelector('svg.lucide-download')).not.toBeNull();
    await user.click(button);

    const pending = await screen.findByRole('button', { name: 'Exporting…' });
    expect(pending).toBeDisabled();
    release();
    await waitFor(() => expect(downloads).toEqual(['summer-love-2026-11-18.zip']));
    expect(calls.some((c) => c.path === '/api/novels/3/export')).toBe(true);
    expect(create).toHaveBeenCalled();
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:zip'));
    expect(await screen.findByRole('button', { name: 'Export' })).toBeEnabled();
  });

  it('export errors show a toast', async () => {
    fakeFetch([
      getNovel,
      {
        method: 'GET',
        path: '/api/novels/3/export',
        status: 409,
        body: problem(409, 'NOTHING_TO_EXPORT', 'No chapter has text to export yet.'),
      },
    ]);
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Export' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No chapter has text to export yet', undefined));
  });

  it('export is disabled without chapters', async () => {
    fakeFetch([{ ...getNovel, body: novelDetail({ chapters: [] }) }]);
    renderPage();

    expect(await screen.findByRole('button', { name: 'Export' })).toBeDisabled();
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
  const line = () => screen.queryByText(/is translating…/, { selector: '.novel-busy' });

  it('shows the translating chapter and the reason when a chapter translates', async () => {
    const busy = wattpad({
      chapters: [chapterSummary({ id: 10, chapterNo: 25, title: 'Chương 25: Mưa', pageCount: 0, translationStatus: 'TRANSLATING', publishStatus: 'DRAFT' })],
    });
    fakeFetch([route(busy), parts]);
    renderPage();
    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

    expect(line()).toHaveTextContent('Chương 25: Mưa is translating…');
    expect(next()).toBeDisabled();
    await expectTooltip(next().parentElement!, 'Chương 25: Mưa is still translating');
  });

  it('polls while a chapter translates, then drops the line and re-enables the button', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const translating = wattpad({
        chapters: [chapterSummary({ id: 10, chapterNo: 25, title: 'Chương 25: Mưa', pageCount: 0, translationStatus: 'TRANSLATING', publishStatus: 'DRAFT' })],
      });
      const routes = [route(translating), parts];
      const calls = fakeFetch(routes);
      renderPage();
      await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
      expect(line()).not.toBeNull();
      const before = calls.filter((c) => c.path === '/api/novels/3').length;

      await vi.advanceTimersByTimeAsync(3500);
      expect(calls.filter((c) => c.path === '/api/novels/3').length).toBeGreaterThan(before);
      expect(line()).not.toBeNull();

      routes[0] = route(wattpad());
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
