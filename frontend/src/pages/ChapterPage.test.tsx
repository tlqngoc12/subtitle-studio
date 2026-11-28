import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import highlightsSource from '../components/novel/FindHighlights.tsx?raw';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChapterDetail } from '../api/novels';
import { AppToaster } from '../components/AppToaster';
import { answerConfirm } from '../test/confirm';
import * as download from '../lib/download';
import { fakeFetch, problem, type Route as FakeRoute } from '../test/fakeFetch';
import { chapterDetail, chapterSummary, novelDetail } from '../test/novelFixtures';
import ChapterPage, { AUTO_SAVE_MS } from './ChapterPage';
import { css } from '../test/css';
import { expectTooltip } from '../test/tooltip';


vi.mock('sonner', async (orig) => ({
  ...(await orig<typeof import('sonner')>()),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

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

/** jsdom has no layout: say whether the window is 1024 px wide or more. */
const stubWide = (wide: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: wide && query.includes('1024px'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

/** Opens the bar's ⋯ menu and returns the item with this name. */
async function menuItem(name: string | RegExp) {
  const trigger = screen.getByRole('button', { name: 'Chapter actions' });
  if (trigger.getAttribute('aria-expanded') !== 'true') await userEvent.setup(vi.isFakeTimers() ? { advanceTimers: vi.advanceTimersByTime } : {}).click(trigger);
  return screen.findByRole('button', { name });
}

/** Opens the menu and clicks the item. */
async function chooseAction(name: string | RegExp) {
  await userEvent.setup(vi.isFakeTimers() ? { advanceTimers: vi.advanceTimersByTime } : {}).click(await menuItem(name));
}

/** Names of the menu's items (it is closed again afterwards). */
async function menuItemNames() {
  await userEvent.setup().click(screen.getByRole('button', { name: 'Chapter actions' }));
  await waitFor(() => expect(document.querySelector('.member-menu__list')).not.toBeNull());
  const names = [...document.querySelectorAll('.member-menu__item')].map((b) => b.textContent);
  await userEvent.setup().keyboard('{Escape}');
  return names;
}

describe('ChapterPage', () => {
  beforeEach(() => vi.mocked(toast.success).mockClear());
  afterEach(() => vi.useRealTimers());

  it('shows Novels > novel > chapter as breadcrumbs instead of a back link', async () => {
    renderPage([get()]);
    await loaded();

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Novels' })).toHaveAttribute('href', '/novels');
    expect(within(nav).getByRole('link', { name: 'Translated' })).toHaveAttribute('href', '/novels?tab=translated');
    expect(within(nav).getByRole('link', { name: 'Tình Yêu Mùa Hạ' })).toHaveAttribute('href', '/novels/3');
    expect(within(nav).getByText('Chapter 1: Mở đầu')).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector('.back-link')).toBeNull();
  });

  it('puts a chapter of an original story under Originals', async () => {
    renderPage([get({ sourceType: 'ORIGINAL' })]);
    await loaded();

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Originals' })).toHaveAttribute('href', '/novels?tab=originals');
    expect(within(nav).queryByRole('link', { name: 'Translated' })).not.toBeInTheDocument();
  });

  it('asks before the tab crumb leaves with unsaved edits', async () => {
    renderPage([get()]);
    await loaded();

    await user().type(textBox(), '!');
    await user().click(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Translated' }));

    await answerConfirm('Cancel', 'Leave without saving?');
  });

  describe('the chapter popover', () => {
    const novelRoute: FakeRoute = {
      method: 'GET',
      path: '/api/novels/3',
      status: 200,
      body: novelDetail({ chapters: [chapterSummary({ id: 8, chapterNo: 0 }), chapterSummary({ id: 9 }), chapterSummary({ id: 10, chapterNo: 2, title: 'Chapter 2: Mưa' })] }),
    };

    it('shows an icon-only All chapters button between Previous and Next', async () => {
      renderPage([get({ prevChapterId: 8, nextChapterId: 10 })]);
      await loaded();

      expect(screen.getByRole('button', { name: 'All chapters' }).textContent).toBe('');
    });

    it('asks before a chosen chapter leaves with unsaved edits', async () => {
      renderPage([get({ prevChapterId: 8, nextChapterId: 10 }), novelRoute]);
      await loaded();
      await user().type(textBox(), '!');

      await user().click(screen.getByRole('button', { name: 'All chapters' }));
      await user().click(await screen.findByRole('link', { name: /Chapter 2/ }));

      await answerConfirm('Cancel', 'Leave without saving?');
      expect((textBox() as HTMLTextAreaElement).value).toContain('!');
    });
  });

  it('asks before a breadcrumb leaves with unsaved edits: Cancel stays, Leave goes', async () => {
    renderPage([get()]);
    await loaded();
    const nav = () => screen.getByRole('navigation', { name: 'Breadcrumb' });

    await user().type(textBox(), '!');
    await user().click(within(nav()).getByRole('link', { name: 'Tình Yêu Mùa Hạ' }));
    await answerConfirm('Cancel', 'Leave without saving?');
    expect(screen.queryByText('novel page')).not.toBeInTheDocument();
    expect(textBox()).toHaveValue('Trang một\n\nTrang hai!');

    await user().click(within(nav()).getByRole('link', { name: 'Tình Yêu Mùa Hạ' }));
    await answerConfirm('Leave', 'Leave without saving?');
    expect(await screen.findByText('novel page')).toBeInTheDocument();
  });

  it('puts Save and the ⋯ menu (which holds Publish) in the sticky bar with the badges, and no other buttons in the header', async () => {
    renderPage([get()]);
    await loaded();

    const bar = document.querySelector('.chapter-bar') as HTMLElement;
    expect(within(bar).getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Chapter actions' })).toBeInTheDocument();
    expect(within(bar).getByText('Translated')).toBeInTheDocument();
    const header = screen.getByRole('heading', { level: 1 }).closest('header')!;
    expect(within(header).queryByRole('button')).toBeNull();
  });

  it('has no bottom form bar: Save is not in a FormActions', async () => {
    renderPage([get()]);
    await loaded();

    expect(document.querySelector('.form-actions')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' }).closest('.chapter-bar')).not.toBeNull();
  });

  describe('one primary button', () => {
    const primaries = () => [...document.querySelectorAll('.chapter-bar .button--primary')].map((b) => b.textContent);

    it('is none on a clean Draft', async () => {
      renderPage([get()]);
      await loaded();

      expect(primaries()).toEqual([]);
    });

    it('is Save on a dirty Draft, and Publish is disabled with "Save first"', async () => {
      renderPage([get()]);
      await loaded();

      fireEvent.change(textBox(), { target: { value: 'đã sửa' } });

      expect(primaries()).toEqual(['Save']);
      const publish = await menuItem('Publish');
      expect(publish).toBeDisabled();
      await expectTooltip(publish.parentElement!, 'Save first');
    });

    it('is none on a clean Published chapter, and Save on a dirty one', async () => {
      renderPage([get({ publishStatus: 'PUBLISHED' })]);
      await loaded();
      expect(primaries()).toEqual([]);

      fireEvent.change(textBox(), { target: { value: 'đã sửa' } });

      expect(primaries()).toEqual(['Save']);
    });
  });

  describe('the ⋯ menu', () => {
    it('lists Translate again (red), no Unpublish on a translated Draft', async () => {
      renderPage([get()]);
      await loaded();

      expect(await menuItemNames()).toEqual(['Publish', 'Export chapter', 'Translate again']);
      const again = await menuItem('Translate again');
      expect(again).toHaveClass('member-menu__item--danger');
    });

    it('says plain Translate (not red) before the first translation', async () => {
      renderPage([get({ translationStatus: 'NONE', text: '' })]);
      await loaded();

      expect(await menuItem('Translate')).not.toHaveClass('member-menu__item--danger');
    });

    it('lists Unpublish on a Published chapter, and no Translate', async () => {
      renderPage([get({ publishStatus: 'PUBLISHED' })]);
      await loaded();

      expect(await menuItemNames()).toEqual(['Unpublish', 'Export chapter']);
    });

    it('lists Reload original on a Wattpad Draft', async () => {
      renderPage([get({ pages: [], text: 'x', sourceText: 'Src', wattpadPartId: '1', sourceLanguage: 'en' })]);
      await loaded();

      expect(await menuItemNames()).toEqual(['Publish', 'Export chapter', 'Translate again', 'Reload original']);
    });

    it('gives every chapter menu item an icon', async () => {
      renderPage([get({ pages: [], text: 'x', sourceText: 'Src', wattpadPartId: '1', sourceLanguage: 'en' })]);
      await loaded();
      for (const name of ['Export chapter', 'Translate again', 'Reload original']) {
        expect((await menuItem(name)).querySelector('svg')).not.toBeNull();
      }
    });

    it('gives Unpublish an icon', async () => {
      renderPage([get({ publishStatus: 'PUBLISHED' })]);
      await loaded();
      expect((await menuItem('Unpublish')).querySelector('svg')).not.toBeNull();
    });
  });

  it('has no Publish item on a Published chapter', async () => {
    renderPage([get({ publishStatus: 'PUBLISHED' })]);
    await loaded();

    expect(await menuItemNames()).not.toContain('Publish');
  });

  describe('Export chapter', () => {
    it('is disabled with a reason when the chapter has no text', async () => {
      renderPage([get({ text: '', pages: [] })]);
      await loaded();

      const item = await menuItem('Export chapter');
      expect(item).toBeDisabled();
      await expectTooltip(item.parentElement!, 'This chapter has no text yet.');
    });

    it('is disabled with "Save your changes first." while the chapter is dirty', async () => {
      renderPage([get()]);
      await loaded();
      fireEvent.change(textBox(), { target: { value: 'đã sửa' } });

      const item = await menuItem('Export chapter');
      expect(item).toBeDisabled();
      await expectTooltip(item.parentElement!, 'Save your changes first.');
    });

    it('downloads the saved chapter as a zip', async () => {
      const save = vi.spyOn(download, 'saveBlob').mockImplementation(() => {});
      const calls = renderPage([
        get(),
        {
          method: 'GET',
          path: '/api/chapters/9/export',
          status: 200,
          body: 'zip',
          headers: { 'Content-Disposition': 'attachment; filename="s-chapter-1-2026-11-23.zip"' },
        },
      ]);
      await loaded();

      await chooseAction('Export chapter');

      await waitFor(() => expect(save).toHaveBeenCalledWith(expect.any(Blob), 's-chapter-1-2026-11-23.zip'));
      expect(calls.some((c) => c.path === '/api/chapters/9/export')).toBe(true);
    });

    it('is in the menu of an original story: Publish, Export chapter, no Translate', async () => {
      renderPage([get({ sourceType: 'ORIGINAL' })]);
      await loaded();

      expect(await menuItemNames()).toEqual(['Publish', 'Export chapter']);
    });
  });

  it('has a text-only Save button', async () => {
    renderPage([get()]);
    await loaded();

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.querySelector('svg')).toBeNull();
  });

  it('edits the whole chapter in one box, with the screenshots apart', async () => {
    renderPage([get()]);
    await loaded();

    expect(textBox()).toHaveValue('Trang một\n\nTrang hai');
    expect(screen.queryByLabelText('Page 1 translation')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enlarge page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enlarge page 2' })).toBeInTheDocument();
    expect(screen.getByText('Translated', { selector: '.badge' })).toBeInTheDocument();
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

  it('copies the current text, with unsaved edits and without image markers, from a button in the box corner', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderPage([get()]);
    await loaded();

    fireEvent.change(textBox(), { target: { value: 'Bản sửa\n\n[[image:3]]\n\nĐoạn hai' } });
    const button = screen.getByRole('button', { name: 'Copy chapter text' });
    expect(button.parentElement).toHaveClass('chapter-text__box');
    await act(async () => {
      fireEvent.click(button);
    });

    expect(writeText).toHaveBeenCalledWith('Bản sửa\n\nĐoạn hai');
    expect(toast.success).toHaveBeenCalledWith('Copied');
  });

  it('pins the chapter text copy button and keeps the textarea and the find highlights padded alike', () => {
    expect(css).toMatch(/\.chapter-text__box > \.copy-corner\s*\{[^}]*position:\s*absolute[^}]*top:[^}]*right:/);
    expect(css).toMatch(/\.chapter-text textarea\s*\{[^}]*padding-right:\s*3rem/);
    // The highlights overlay copies the textarea's computed padding (see FindHighlights), so they stay aligned.
    expect(highlightsSource).toContain("'paddingRight'");
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
    expect(sent).toEqual({ title: 'Chapter 1: Mở đầu', text: 'Cả chương đã sửa' });
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

    await chooseAction('Translate again');
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
    expect(await menuItem('Publish')).toBeDisabled();
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
    expect(await menuItem('Translate again')).toBeEnabled();
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

    await chooseAction('Publish');
    expect(await screen.findByText('Every page needs a translation before publishing.')).toBeInTheDocument();

    routes[1] = { method: 'POST', path: '/api/chapters/9/publish', status: 200, body: chapterDetail({ publishStatus: 'PUBLISHED' }) };
    await chooseAction('Publish');

    expect(await menuItem('Unpublish')).toBeInTheDocument();
    expect(within(document.querySelector('.chapter-bar') as HTMLElement).getByText('Published')).toBeInTheDocument();
  });

  it('does not let Unpublish drop unsaved edits', async () => {
    renderPage([get({ publishStatus: 'PUBLISHED' })]);
    await loaded();
    expect(await menuItem('Unpublish')).toBeEnabled();
    await user().keyboard('{Escape}');

    await user().type(textBox(), '!');

    expect(await menuItem('Unpublish')).toBeDisabled();
  });

  it('shows only the text and title of a published chapter', async () => {
    renderPage([get({ publishStatus: 'PUBLISHED' })]);
    await loaded();

    expect(screen.getByText(/This chapter is published: only the text and title can be edited\./)).toBeInTheDocument();
    expect(textBox()).toBeEnabled();
    expect(screen.getByLabelText('Chapter title')).toBeEnabled();
    expect(screen.queryByLabelText('Number')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add page screenshots')).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Pages' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Translate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enlarge page 1' })).not.toBeInTheDocument();
    expect(await menuItem('Unpublish')).toBeInTheDocument();
  });

  it('saves the chapter title, never a number or a label', async () => {
    const calls = renderPage([
      get(),
      {
        method: 'PUT',
        path: '/api/chapters/9',
        status: 200,
        body: chapterDetail({ title: 'Ngoại truyện I' }),
      },
    ]);
    await loaded();

    expect(screen.queryByLabelText('Number')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Chapter label (optional)')).not.toBeInTheDocument();
    await user().clear(screen.getByLabelText('Chapter title'));
    await user().type(screen.getByLabelText('Chapter title'), 'Ngoại truyện I');
    await user().click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const sent = JSON.parse(String(calls.find((c) => c.method === 'PUT')!.body));
    expect(sent).toEqual({ title: 'Ngoại truyện I', text: expect.any(String) });
    expect(await screen.findByRole('heading', { name: 'Ngoại truyện I' })).toBeInTheDocument();
  });

  it('shows the field error when the server refuses the title', async () => {
    renderPage([
      get(),
      {
        method: 'PUT',
        path: '/api/chapters/9',
        status: 400,
        body: { code: 'INVALID_CHAPTER', detail: 'x', errors: [{ field: 'title', message: 'Enter a chapter title.' }] },
      },
    ]);
    await loaded();

    await user().clear(screen.getByLabelText('Chapter title'));
    await user().click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Enter a chapter title.')).toBeInTheDocument();
  });

  it('keeps every control on a draft chapter', async () => {
    renderPage([get()]);
    await loaded();

    expect(screen.queryByText(/This chapter is published/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Chapter title')).toBeEnabled();
    expect(screen.getByLabelText('Add page screenshots')).toBeInTheDocument();
    expect(await menuItem('Translate again')).toBeInTheDocument();
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

      await chooseAction('Translate again');
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog).toHaveAccessibleName('Landscape pages');
      expect(dialog).toHaveTextContent('1 page(s) are landscape — Gemini reads sideways text poorly. Translate anyway?');
      await user().click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

      expect(calls.some((c) => c.path === '/api/chapters/9/translate')).toBe(false);

      await chooseAction('Translate again');
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

describe('ChapterPage name in the bar', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the short name in the bar only once the H1 has scrolled off screen', async () => {
    let report!: (visible: boolean) => void;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          report = (visible) => cb([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
        }
        observe() {}
        disconnect() {}
      },
    );
    renderPage([get()]);
    await loaded();
    const barTitle = () => document.querySelector('.chapter-bar__title');
    expect(barTitle()).not.toBeNull(); // unknown yet: shown

    act(() => report(true));
    expect(barTitle()).toBeNull();

    act(() => report(false));
    expect(barTitle()).not.toBeNull();
  });
});

describe('ChapterPage with the wrong novel in the URL', () => {
  function Where() {
    const { id, chapterId } = useParams();
    return <p>at novel {id} chapter {chapterId}</p>;
  }

  it('replaces the URL with the own novel of the chapter', async () => {
    fakeFetch([get()]);
    render(
      <MemoryRouter initialEntries={['/novels/7/chapters/9']}>
        <Routes>
          <Route path="/novels/:id/chapters/:chapterId" element={<><ChapterPage /><Where /></>} />
        </Routes>
      </MemoryRouter>,
    );

    // chapterDetail() belongs to novel 3.
    expect(await screen.findByText('at novel 3 chapter 9')).toBeInTheDocument();
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

  it('auto-saves after 15 minutes of unsaved changes with an Auto-saved toast', async () => {
    expect(AUTO_SAVE_MS).toBe(900_000);
    const calls = renderPage([get(), put]);
    await loaded();
    vi.useFakeTimers();
    edit();
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_MS - 1000));
    expect(puts(calls)).toHaveLength(0);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    vi.useRealTimers();
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(toast.success).toHaveBeenCalledWith('Chapter auto-saved');
    expect(toast.success).not.toHaveBeenCalledWith('Chapter saved');
  });

  it('never auto-saves a clean chapter', async () => {
    const calls = renderPage([get(), put]);
    await loaded();
    vi.useFakeTimers();
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_MS * 2));
    expect(puts(calls)).toHaveLength(0);
  });

  it('never saves while Sync from Wattpad is open, and the synced text is clean afterwards', async () => {
    const original = { sourceType: 'ORIGINAL' as const, sourceLanguage: 'vi' as const, pages: [], translationStatus: 'NONE' as const,
      translationModel: null, sourceText: null, wattpadLinked: true };
    const calls = renderPage([
      get({ ...original, text: 'Old text' }),
      put,
      { method: 'GET', path: '/api/novels/3/wattpad/parts', status: 200,
        body: [{ partId: '7', title: 'Chapter 1: Mở đầu', wordCount: 10, createdAt: null, modifiedAt: null, deleted: false, importedChapterId: null }] },
      { method: 'POST', path: '/api/chapters/9/wattpad-sync', status: 200, body: chapterDetail({ ...original, text: 'Synced text' }) },
    ]);
    await loaded();
    edit();
    await chooseAction('Sync from Wattpad');
    const dialog = await screen.findByRole('dialog', { name: 'Sync from Wattpad' });
    await within(dialog).findByRole('radio', { name: /Chapter 1: Mở đầu/ });

    vi.useFakeTimers();
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_MS * 2));
    ctrlS();
    vi.useRealTimers();
    expect(puts(calls)).toHaveLength(0);

    await user().click(within(dialog).getByRole('button', { name: 'Sync' }));
    await user().click(within(dialog).getByRole('button', { name: 'Replace text' }));
    await waitFor(() => expect(textBox()).toHaveValue('Synced text'));
    expect(puts(calls)).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
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

  it('has only the Chapter title in the details row, with an info tooltip', async () => {
    renderPage([get()]);
    await loaded();

    const row = screen.getByLabelText('Chapter title').closest('.chapter-meta__row')!;
    expect(row).not.toBeNull();
    expect([...row.querySelectorAll(':scope > .field')].map((f) => f.className)).toEqual(['field chapter-meta__title']);
    expect(css).toContain('.chapter-meta__row');
    expect(screen.queryByLabelText('Number')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Order')).not.toBeInTheDocument();
    await user().hover(screen.getByRole('button', { name: 'About Chapter title' }));
    expect((await screen.findAllByText(/The chapter's name everywhere/)).length).toBeGreaterThan(0);
  });
});

describe('ChapterPage from Wattpad (original text, no pages)', () => {
  beforeEach(() => vi.mocked(toast.success).mockClear());

  const detail = (over: Partial<ChapterDetail> = {}) =>
    chapterDetail({
      pages: [],
      text: '',
      translationStatus: 'NONE',
      sourceText: 'First paragraph.\n\nSecond paragraph.',
      wattpadPartId: '1552',
      sourceFetchedAt: '2026-11-13T01:00:00Z',
      sourceLanguage: 'en',
      ...over,
    });
  const wattpad = (over: Partial<ChapterDetail> = {}): FakeRoute => ({
    method: 'GET',
    path: '/api/chapters/9',
    status: 200,
    body: detail(over),
  });

  it('shows the original beside the chapter text and no page tools', async () => {
    stubWide(true);
    renderPage([wattpad()]);
    await loaded();

    const original = screen.getByRole('region', { name: 'Original text' });
    expect(original).toHaveTextContent('First paragraph.');
    expect(original).toHaveTextContent('Second paragraph.');
    expect(original).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('heading', { name: 'Original (English)' })).toBeInTheDocument();
    expect(screen.getByText(/Fetched from Wattpad 13\/11\/2026/)).toBeInTheDocument();
    expect(textBox()).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pages' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Rotate all/)).not.toBeInTheDocument();
  });

  it('labels a Thai original', async () => {
    stubWide(true);
    renderPage([wattpad({ sourceLanguage: 'th' })]);
    await loaded();

    expect(screen.getByRole('heading', { name: 'Original (Thai)' })).toBeInTheDocument();
  });

  it('can translate without pages', async () => {
    const calls = renderPage([
      wattpad(),
      { method: 'POST', path: '/api/chapters/9/translate', status: 202, body: detail({ translationStatus: 'TRANSLATING' }) },
      { method: 'GET', path: '/api/chapters/9', status: 200, body: detail({ translationStatus: 'TRANSLATING' }) },
    ]);
    await loaded();

    const translate = await menuItem('Translate');
    expect(translate).toBeEnabled();
    await userEvent.setup().click(translate);

    expect(await screen.findByText('Gemini is translating the chapter…')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/chapters/9/translate')).toBe(true);
  });

  it('asks before Translate again when the text was edited', async () => {
    renderPage([
      wattpad({ translationStatus: 'TRANSLATED', text: 'Bản dịch', editedAfterTranslation: true }),
      { method: 'POST', path: '/api/chapters/9/translate', status: 202, body: detail({ translationStatus: 'TRANSLATING' }) },
    ]);
    await loaded();

    await chooseAction('Translate again');
    await answerConfirm('Translate again', 'Translate this chapter again?');

    expect(await screen.findByText('Gemini is translating the chapter…')).toBeInTheDocument();
  });

  it('Reload original asks first, replaces only the original and keeps unsaved edits', async () => {
    const calls = renderPage([
      wattpad({ text: 'Bản dịch' }),
      {
        method: 'POST',
        path: '/api/chapters/9/reload-original',
        status: 200,
        body: detail({ text: 'Bản dịch', sourceText: 'Fresh original.', sourceFetchedAt: '2026-11-14T02:00:00Z' }),
      },
    ]);
    await loaded();
    const u = userEvent.setup();
    await u.type(textBox(), ' sửa');

    await chooseAction('Reload original');
    await answerConfirm('Reload original', 'Reload the original text?');

    await waitFor(() => expect(screen.getByRole('region', { name: 'Original text' })).toHaveTextContent('Fresh original.'));
    expect(calls.some((c) => c.path === '/api/chapters/9/reload-original')).toBe(true);
    expect(textBox()).toHaveValue('Bản dịch sửa');
    expect(screen.getByText(/Fetched from Wattpad 14\/11\/2026/)).toBeInTheDocument();
  });

  it('does not reload when the confirm is cancelled', async () => {
    const calls = renderPage([wattpad()]);
    await loaded();

    await chooseAction('Reload original');
    await answerConfirm('Cancel');

    expect(calls.some((c) => c.path === '/api/chapters/9/reload-original')).toBe(false);
  });

  it('a published chapter looks like a published screenshot chapter: no Original column, only the text', async () => {
    renderPage([wattpad({ publishStatus: 'PUBLISHED', translationStatus: 'TRANSLATED', text: 'Bản dịch' })]);
    await loaded();

    expect(await menuItemNames()).toEqual(['Unpublish', 'Export chapter']);
    expect(screen.queryByRole('region', { name: 'Original text' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Original/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Fetched from Wattpad/)).not.toBeInTheDocument();
    expect(screen.getByText(/This chapter is published: only the text and title can be edited\./)).toBeInTheDocument();
    expect(textBox()).toHaveValue('Bản dịch');
    expect(screen.queryByLabelText('Number')).not.toBeInTheDocument();
  });

  it('lets a published text chapter show its original read-only with Show original, and hide it by pressing it again', async () => {
    const user = userEvent.setup();
    renderPage([wattpad({ publishStatus: 'PUBLISHED', translationStatus: 'TRANSLATED', text: 'Bản dịch' })]);
    await loaded();
    expect(screen.queryByRole('region', { name: 'Original text' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show original' }));

    expect(screen.getByRole('region', { name: 'Original text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show original' })).toHaveAttribute('aria-pressed', 'true');
    expect(textBox()).toHaveValue('Bản dịch'); // the translation stays editable
    expect(await menuItemNames()).toEqual(['Unpublish', 'Export chapter']); // no Reload original on a published chapter

    await user.click(screen.getByRole('button', { name: 'Show original' }));
    expect(screen.queryByRole('region', { name: 'Original text' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show original' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('has no Show original button on a draft (the original is already there) or on a screenshot chapter', async () => {
    renderPage([wattpad({ text: 'Bản dịch' })]);
    await loaded();
    expect(screen.queryByRole('button', { name: /original$/i })).not.toBeInTheDocument();
    cleanup();

    renderPage([get({ publishStatus: 'PUBLISHED' })]);
    await loaded();
    expect(screen.queryByRole('button', { name: 'Show original' })).not.toBeInTheDocument();
  });

  it('words the published note for each kind of chapter', async () => {
    renderPage([get({ publishStatus: 'PUBLISHED' })]);
    await loaded();
    expect(screen.getByText('This chapter is published: only the text and title can be edited. Unpublish to change pages or translate again.')).toBeInTheDocument();
    cleanup();

    renderPage([wattpad({ publishStatus: 'PUBLISHED', translationStatus: 'TRANSLATED', text: 'x' })]);
    await loaded();
    expect(screen.getByText('This chapter is published: only the text and title can be edited. Unpublish to translate again.')).toBeInTheDocument();
    expect(screen.queryByText(/change pages/)).not.toBeInTheDocument();
  });

  it('a published Wattpad page has the same width as a published screenshot page', async () => {
    renderPage([get({ publishStatus: 'PUBLISHED' })]);
    await loaded();
    const screenshotClass = screen.getByRole('main').className;
    cleanup();

    renderPage([wattpad({ publishStatus: 'PUBLISHED', translationStatus: 'TRANSLATED', text: 'x' })]);
    await loaded();
    expect(screen.getByRole('main').className).toBe(screenshotClass);
    expect(screenshotClass).toContain('page--narrow');
  });

  it('a draft keeps the Original column with Reload original', async () => {
    renderPage([wattpad()]);
    await loaded();

    expect(screen.getByRole('region', { name: 'Original text' })).toBeInTheDocument();
    expect(await menuItem('Reload original')).toBeInTheDocument();
    expect(screen.getByRole('main').className).not.toContain('page--narrow');
  });

  it('shows the reload error', async () => {
    renderPage([
      wattpad(),
      { method: 'POST', path: '/api/chapters/9/reload-original', status: 502, body: problem(502, 'WATTPAD_UNAVAILABLE', 'x') },
    ]);
    await loaded();
    await chooseAction('Reload original');
    await answerConfirm('Reload original');

    expect(await screen.findByRole('alert')).toHaveTextContent('Wattpad did not answer. Try again later.');
  });

  it('a screenshot chapter shows no Original panel', async () => {
    renderPage([get()]);
    await loaded();

    expect(screen.queryByRole('region', { name: 'Original text' })).not.toBeInTheDocument();
    expect(await menuItemNames()).toEqual(['Publish', 'Export chapter', 'Translate again']);
  });
});

describe('ChapterPage: Fetch & translate next', () => {
  const NEXT = 'Fetch & translate next';
  const last = (over: Partial<ChapterDetail> = {}): FakeRoute => ({
    method: 'GET',
    path: '/api/chapters/9',
    status: 200,
    body: chapterDetail({ sourceText: 'Hello', wattpadPartId: '55', sourceLanguage: 'en', nextChapterId: null, ...over }),
  });
  const started = (over: Partial<ChapterDetail> = {}): FakeRoute => ({
    method: 'POST',
    path: '/api/novels/3/wattpad/next/fetch-translate',
    status: 202,
    body: chapterDetail({ id: 20, title: 'Chương mới', translationStatus: 'TRANSLATING', ...over }),
  });
  const posts = (calls: { method: string; path: string }[]) => calls.filter((c) => c.method === 'POST');

  beforeEach(() => {
    vi.mocked(toast.info).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it('is shown for a Wattpad chapter that has no next chapter, in place of the next link', async () => {
    renderPage([last()]);
    await loaded();

    expect(screen.getByRole('button', { name: NEXT })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Next chapter' })).not.toBeInTheDocument();
  });

  it('is hidden for a screenshot chapter and when a next chapter exists', async () => {
    renderPage([get({ nextChapterId: null })]);
    await loaded();
    expect(screen.queryByRole('button', { name: NEXT })).not.toBeInTheDocument();
    cleanup();

    renderPage([last({ nextChapterId: 10 })]);
    await loaded();
    expect(screen.queryByRole('button', { name: NEXT })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next chapter' })).toHaveAttribute('href', '/novels/3/chapters/10');
  });

  it('starts the next part once, says so, and opens the new chapter', async () => {
    const calls = renderPage([last(), started()]);
    await loaded();

    await userEvent.setup().click(screen.getByRole('button', { name: NEXT }));

    expect(await screen.findByText('other chapter 20')).toBeInTheDocument();
    expect(posts(calls)).toHaveLength(1);
    expect(toast.info).toHaveBeenCalledWith('Translation started', { description: 'Chương mới' });
  });

  it('asks first when the text has unsaved edits: Cancel sends nothing', async () => {
    const calls = renderPage([last(), started()]);
    await loaded();

    await user().type(textBox(), '!');
    await user().click(screen.getByRole('button', { name: NEXT }));
    await answerConfirm('Cancel', 'Leave without saving?');

    expect(posts(calls)).toHaveLength(0);
    expect(screen.queryByText('other chapter 20')).not.toBeInTheDocument();
    expect(textBox()).toHaveValue('Trang một\n\nTrang hai!');
  });

  it('goes on after the confirmation when the edits are discarded', async () => {
    const calls = renderPage([last(), started()]);
    await loaded();

    await user().type(textBox(), '!');
    await user().click(screen.getByRole('button', { name: NEXT }));
    await answerConfirm('Leave', 'Leave without saving?');

    expect(await screen.findByText('other chapter 20')).toBeInTheDocument();
    expect(posts(calls)).toHaveLength(1);
  });

  it('shows the error and stays on the page when another chapter is translating', async () => {
    renderPage([
      last(),
      { method: 'POST', path: '/api/novels/3/wattpad/next/fetch-translate', status: 409,
        body: problem(409, 'NOVEL_TRANSLATION_BUSY', 'x') },
    ]);
    await loaded();

    await userEvent.setup().click(screen.getByRole('button', { name: NEXT }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Another chapter is still translating', expect.anything()),
    );
    expect(screen.queryByText(/other chapter/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: NEXT })).toBeEnabled();
  });

  it('is disabled while this chapter translates, with a tooltip saying why', async () => {
    renderPage([last({ translationStatus: 'TRANSLATING' })]);
    await loaded();

    const button = screen.getByRole('button', { name: NEXT });
    expect(button).toBeDisabled();
    await expectTooltip(button.parentElement!, 'Chapter 1: Mở đầu is still translating');
  });
});

describe('ChapterPage: Add chapter', () => {
  const NEW = 'Add chapter';
  const last = (over: Partial<ChapterDetail> = {}): FakeRoute =>
    get({ sourceType: 'ORIGINAL', nextChapterId: null, ...over });
  const created: FakeRoute = {
    method: 'POST',
    path: '/api/novels/3/chapters',
    status: 201,
    body: chapterDetail({ id: 99, title: 'Chương mới' }),
  };
  const posts = (calls: { method: string; path: string }[]) => calls.filter((c) => c.method === 'POST');

  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  it('is shown on the last chapter of an original novel and opens the created chapter', async () => {
    const calls = renderPage([last(), created]);
    await loaded();

    await userEvent.setup().click(screen.getByRole('button', { name: NEW }));

    expect(await screen.findByText('other chapter 99')).toBeInTheDocument();
    expect(posts(calls)).toHaveLength(1);
  });

  it('is shown for screenshot novels too', async () => {
    renderPage([last({ sourceType: 'SCREENSHOTS' })]);
    await loaded();

    expect(screen.getByRole('button', { name: NEW })).toBeInTheDocument();
  });

  it('is hidden on a middle chapter and on Wattpad novels', async () => {
    renderPage([last({ nextChapterId: 12 })]);
    await loaded();
    expect(screen.queryByRole('button', { name: NEW })).not.toBeInTheDocument();
    cleanup();

    renderPage([last({ sourceType: 'WATTPAD', wattpadPartId: 'p1' })]);
    await loaded();
    expect(screen.queryByRole('button', { name: NEW })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch & translate next' })).toBeInTheDocument();
  });

  it('asks before leaving unsaved edits: Cancel creates nothing', async () => {
    const calls = renderPage([last(), created]);
    await loaded();

    await user().type(textBox(), '!');
    await user().click(screen.getByRole('button', { name: NEW }));
    await answerConfirm('Cancel', 'Leave without saving?');

    expect(posts(calls)).toHaveLength(0);
    expect(screen.queryByText(/other chapter/)).not.toBeInTheDocument();
  });

  it('shows an error toast and stays on the chapter when creating fails', async () => {
    renderPage([
      last(),
      { method: 'POST', path: '/api/novels/3/chapters', status: 500, body: problem(500, 'INTERNAL', 'x') },
    ]);
    await loaded();

    await userEvent.setup().click(screen.getByRole('button', { name: NEW }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByText(/other chapter/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: NEW })).toBeEnabled();
  });

  it('is disabled while the chapter translates', async () => {
    renderPage([last({ translationStatus: 'TRANSLATING' })]);
    await loaded();

    expect(screen.getByRole('button', { name: NEW })).toBeDisabled();
  });
});

describe('ChapterPage status line', () => {
  afterEach(() => vi.useRealTimers());
  const edit = (value: string) => fireEvent.change(textBox(), { target: { value } });
  const line = () => screen.getByText(/ words? · /);

  it('shows words, characters and paragraphs of the chapter text', async () => {
    renderPage([get()]);
    await loaded();

    expect(line()).toHaveTextContent('4 words · 20 characters · 2 paragraphs');
    expect(screen.queryByText(/of the original/)).not.toBeInTheDocument();
  });

  it('formats big numbers with separators', async () => {
    renderPage([get({ text: Array.from({ length: 3412 }, () => 'w').join(' ') })]);
    await loaded();

    expect(line()).toHaveTextContent(/^3,412 words · 6,823 characters · 1 paragraph$/);
  });

  it('updates about 300 ms after typing, not on every key', async () => {
    renderPage([get()]);
    await loaded();
    vi.useFakeTimers();

    act(() => edit('one two three'));
    expect(line()).toHaveTextContent('4 words');
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(line()).toHaveTextContent('4 words');
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(line()).toHaveTextContent('3 words · 13 characters · 1 paragraph');
  });

  describe('a text chapter (Wattpad)', () => {
    const source = Array.from({ length: 10 }, (_, i) => `Source ${i}`).join('\n\n');
    const paras = (n: number) => Array.from({ length: n }, (_, i) => `Dòng ${i}`).join('\n\n');
    const wattpad = (text: string): FakeRoute =>
      get({ pages: [], text, sourceText: source, wattpadPartId: '1', sourceLanguage: 'en' });

    it('compares the paragraphs with the original', async () => {
      renderPage([wattpad(paras(10))]);
      await loaded();

      const ratio = screen.getByText(/paragraphs of the original/);
      expect(ratio).toHaveTextContent('· 10/10 paragraphs of the original');
      expect(ratio).not.toHaveClass('chapter-count__warn');
      expect(document.querySelector('.chapter-count .badge--warn')).toBeNull();
    });

    it('shows a warning badge with how many paragraphs are missing, and explains it in a tooltip', async () => {
      renderPage([wattpad(paras(8))]);
      await loaded();

      const badge = document.querySelector('.chapter-count .badge--warn') as HTMLElement;
      expect(badge).toHaveTextContent('−2 paragraphs');
      expect(badge).toHaveTextContent('8/10 paragraphs of the original');
      await expectTooltip(badge, 'The translation may be missing a part');
    });

    it('shows the badge for any difference, even one paragraph, and says plus when there are extra paragraphs', async () => {
      renderPage([wattpad(paras(9))]);
      await loaded();
      expect(document.querySelector('.chapter-count .badge--warn')).toHaveTextContent('−1 paragraph');
      cleanup();

      renderPage([wattpad(paras(12))]);
      await loaded();
      expect(document.querySelector('.chapter-count .badge--warn')).toHaveTextContent('+2 paragraphs');
    });

    it('draws the warning in the warning colours with an icon, never in red', () => {
      expect(css).toMatch(/\.badge--warn\s*\{[^}]*color:\s*var\(--brand-ink\)/);
      expect(css).not.toMatch(/\.chapter-count__warn\s*\{[^}]*--danger/);
    });
  });
});

describe('ChapterPage editor and save state', () => {
  const put: FakeRoute = { method: 'PUT', path: '/api/chapters/9', status: 200, body: chapterDetail({ text: 'x' }) };
  const edit = (value = 'đã sửa') => fireEvent.change(textBox(), { target: { value } });
  const state = () => document.querySelector('.chapter-bar__state') as HTMLElement;
  afterEach(() => vi.useRealTimers());

  it('grows with its text and has no scrollbar of its own', async () => {
    // 100 px per character makes the heights easy to read; the window is 768 px high in jsdom, so the minimum is 460 px.
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLTextAreaElement) {
      return this.value.length * 100;
    });
    renderPage([get()]);
    await loaded();

    await waitFor(() => expect(textBox().style.height).toBe('2000px'));
    edit('x'.repeat(50));
    await waitFor(() => expect(textBox().style.height).toBe('5000px'));
    expect(css).toMatch(/\.chapter-text textarea\s*\{[^}]*overflow-y:\s*hidden/);
    expect(css).toMatch(/\.chapter-text textarea\s*\{[^}]*resize:\s*none/);
  });

  it('puts the chapter and novel in the tab title, with a dot while there are unsaved changes', async () => {
    renderPage([get(), put]);
    await loaded();
    expect(document.title).toBe('Chapter 1: Mở đầu · Tình Yêu Mùa Hạ · Subtitle Studio');

    edit();
    expect(document.title).toBe('● Chapter 1: Mở đầu · Tình Yêu Mùa Hạ · Subtitle Studio');
    await user().click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(document.title).toBe('Chapter 1: Mở đầu · Tình Yêu Mùa Hạ · Subtitle Studio'));
  });

  it('shows nothing before the first save, then Unsaved changes, Saving…, Saved HH:mm', async () => {
    let finish!: () => void;
    renderPage([get(), { ...put, delay: new Promise<void>((r) => (finish = r)) }]);
    await loaded();
    expect(state()).toHaveTextContent('');
    expect(state()).toHaveAttribute('aria-live', 'polite');

    edit();
    expect(state()).toHaveTextContent('Unsaved changes');
    await user().click(screen.getByRole('button', { name: 'Save' }));
    expect(state()).toHaveTextContent('Saving…');
    finish();

    await waitFor(() => expect(state().textContent).toMatch(/^Saved \d\d:\d\d$/));
  });

  it('says Auto-saved HH:mm after the 15-minute timer', async () => {
    renderPage([get(), put]);
    await loaded();
    vi.useFakeTimers();
    edit();
    await act(() => vi.advanceTimersByTimeAsync(AUTO_SAVE_MS));
    vi.useRealTimers();

    await waitFor(() => expect(state().textContent).toMatch(/^Auto-saved \d\d:\d\d$/));
  });

  it('goes back to Unsaved changes when typing after a save', async () => {
    renderPage([get(), put]);
    await loaded();
    edit();
    await user().click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state().textContent).toMatch(/^Saved /));

    edit('another');

    expect(state()).toHaveTextContent('Unsaved changes');
  });

  it('Save is a plain disabled button when clean and the one primary when dirty', async () => {
    renderPage([get()]);
    await loaded();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    expect(save).not.toHaveClass('button--primary');

    edit();

    expect(save).toBeEnabled();
    expect(save).toHaveClass('button--primary');
  });

  it('Publish is disabled while a translation runs, with the reason in a tooltip', async () => {
    renderPage([get({ translationStatus: 'TRANSLATING' })]);
    await loaded();
    const publish = await menuItem('Publish');

    expect(publish).toBeDisabled();
    await expectTooltip(publish.parentElement!, 'Wait until this chapter finishes translating.');
  });
});

describe('ChapterPage reading width and the aligned original', () => {
  const source = 'One.\n\nTwo.\n\nThree.\n\nFour.';
  const wattpad = (over: Partial<ChapterDetail> = {}): FakeRoute =>
    get({ pages: [], text: 'Một\n\nHai\n\nBa\n\nBốn', sourceText: source, wattpadPartId: '1', sourceLanguage: 'en', ...over });
  it('sets the editor to about 72 characters wide in 17 px type', () => {
    expect(css).toMatch(/\.chapter-text\s*\{[^}]*max-width:\s*72ch/);
    expect(css).toMatch(/\.chapter-text textarea\s*\{[^}]*font-size:\s*1\.0625rem/);
    expect(css).toMatch(/\.chapter-text textarea\s*\{[^}]*line-height:\s*1\.7/);
  });

  it('puts the original beside the editor from 1024 px', () => {
    expect(css).toMatch(/@media \(min-width: 1024px\)\s*\{\s*\.chapter-columns\s*\{[^}]*grid-template-columns/);
  });

  it('marks the original paragraph that matches the caret and scrolls only that into view', async () => {
    stubWide(true);
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderPage([wattpad()]);
    await loaded();
    const box = textBox() as HTMLTextAreaElement;
    scroll.mockClear();

    // The caret in the third paragraph ("Ba"): "Một\n\nHai\n\nBa" → offset 11.
    box.setSelectionRange(11, 11);
    fireEvent.keyUp(box);

    const region = screen.getByRole('region', { name: 'Original text' });
    await waitFor(() => expect(region.querySelector('[aria-current="true"]')).toHaveTextContent('Three.'));
    expect(region.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
    expect((scroll.mock.contexts.at(-1) as HTMLElement).textContent).toBe('Three.');

    box.setSelectionRange(0, 0);
    fireEvent.click(box);
    await waitFor(() => expect(region.querySelector('[aria-current="true"]')).toHaveTextContent('One.'));

    box.setSelectionRange(16, 16);
    fireEvent.select(box);
    await waitFor(() => expect(region.querySelector('[aria-current="true"]')).toHaveTextContent('Four.'));
  });

  it('matches the paragraphs written about an image with that image, and the text after it with its own paragraph', async () => {
    stubWide(true);
    const text = 'Một\n\n[[image:5]]\n\nChữ trong ảnh\n\nHai';
    renderPage([wattpad({ sourceText: 'One.\n\n[[image:5]]\n\nTwo.', text })]);
    await loaded();
    const box = textBox() as HTMLTextAreaElement;
    const region = screen.getByRole('region', { name: 'Original text' });
    expect(region.querySelector('img')).toHaveAttribute('src', '/api/media/5');

    box.setSelectionRange(text.indexOf('Chữ') + 2, text.indexOf('Chữ') + 2);
    fireEvent.keyUp(box);
    await waitFor(() => expect(region.querySelector('[aria-current="true"] img')).not.toBeNull());

    box.setSelectionRange(text.length, text.length);
    fireEvent.keyUp(box);
    await waitFor(() => expect(region.querySelector('[aria-current="true"]')).toHaveTextContent('Two.'));
  });

  it('shows the original as a closed disclosure below 1024 px', async () => {
    stubWide(false);
    renderPage([wattpad()]);
    await loaded();

    const details = document.querySelector('details.chapter-original') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText('Original (English)')).toBeInTheDocument();
  });

  it('shows no original panel for a screenshot chapter, and no paragraph ratio', async () => {
    stubWide(true);
    renderPage([get()]);
    await loaded();

    expect(document.querySelector('.chapter-original')).toBeNull();
    expect(screen.queryByText(/of the original/)).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Pages' })).toBeInTheDocument();
  });
});

describe('ChapterPage: text first on a phone', () => {
  const STORAGE_KEY = 'chapter-details-open';
  const stubWidth = (min761: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: min761 && query.includes('761px'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  const details = () => document.querySelector('details.chapter-details') as HTMLDetailsElement;
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('keeps the title and the translated-by line in a "Chapter details" disclosure', async () => {
    stubWidth(true);
    renderPage([get({ translationModel: 'gemini-2.5-pro' })]);
    await loaded();

    expect(within(details()).getByText('Chapter details')).toBeInTheDocument();
    expect(within(details()).getByLabelText('Chapter title')).toBeInTheDocument();
    expect(within(details()).getByText('Translated by gemini-2.5-pro')).toBeInTheDocument();
    expect(textBox().closest('details')).toBeNull();
  });

  it('is closed on a phone and open from 761 px', async () => {
    stubWidth(false);
    renderPage([get()]);
    await loaded();
    expect(details().open).toBe(false);
    cleanup();

    stubWidth(true);
    renderPage([get()]);
    await loaded();
    expect(details().open).toBe(true);
  });

  it('remembers what the person chose, in localStorage', async () => {
    stubWidth(false);
    renderPage([get()]);
    await loaded();

    await user().click(within(details()).getByText('Chapter details'));
    await waitFor(() => expect(details().open).toBe(true));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
    cleanup();

    renderPage([get()]);
    await loaded();
    expect(details().open).toBe(true);
  });

  it('a remembered "closed" wins over the wide default', async () => {
    localStorage.setItem(STORAGE_KEY, '0');
    stubWidth(true);
    renderPage([get()]);
    await loaded();

    expect(details().open).toBe(false);
  });

  it('still renders when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    stubWidth(false);
    renderPage([get()]);
    await loaded();

    await user().click(within(details()).getByText('Chapter details'));
    await waitFor(() => expect(details().open).toBe(true));
    expect(textBox()).toBeInTheDocument();
  });

  it('shows the published note as one muted line, not an alert box', async () => {
    renderPage([get({ publishStatus: 'PUBLISHED' })]);
    await loaded();

    const note = screen.getByText(/This chapter is published/);
    expect(note.tagName).toBe('P');
    expect(note).toHaveClass('muted');
    expect(note.closest('.alert')).toBeNull();
    expect(note).not.toHaveAttribute('role', 'alert');
    expect(css).not.toMatch(/\.chapter-note\s*\{[^}]*(border-left|background)/);
  });

  it('the count line and the published note sit inside Chapter details', async () => {
    stubWidth(true);
    renderPage([get({ publishStatus: 'PUBLISHED' })]);
    await loaded();

    expect(screen.getByText(/paragraphs? ·|words ·/).closest('details.chapter-details')).not.toBeNull();
    expect(screen.getByText(/This chapter is published/).closest('details.chapter-details')).not.toBeNull();
    expect(details().compareDocumentPosition(textBox()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a short translation shows its warning on the closed details summary', async () => {
    stubWidth(false);
    const source = Array.from({ length: 10 }, (_, i) => `Source ${i}`).join('\n\n');
    const text = Array.from({ length: 8 }, (_, i) => `Dòng ${i}`).join('\n\n');
    renderPage([get({ pages: [], text, sourceText: source, wattpadPartId: '1', sourceLanguage: 'en' })]);
    await loaded();

    expect(details().open).toBe(false);
    expect(details().querySelector('summary .chapter-count__warn')).not.toBeNull();
  });
});

describe('ChapterPage translator tools', () => {
  const state = () => document.querySelector('.chapter-bar__state') as HTMLElement;
  const ctrl = (key: string, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...init });
    act(() => {
      document.dispatchEvent(e);
    });
    return e;
  };

  it('opens find and replace from the bar button and closes it again', async () => {
    renderPage([get()]);
    await loaded();
    expect(screen.queryByRole('search', { name: 'Find and replace' })).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Find and replace' });

    await user().click(toggle);
    expect(screen.getByRole('search', { name: 'Find and replace' })).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Find')).toHaveFocus();

    await user().click(toggle);
    expect(screen.queryByRole('search', { name: 'Find and replace' })).not.toBeInTheDocument();
  });

  it('paints the matches behind the textarea while finding, and removes everything when find closes', async () => {
    renderPage([get({ text: 'Mai gặp Nam. Mai cười.' })]);
    await loaded();
    expect(document.querySelector('.find-hits')).toBeNull();

    await user().click(screen.getByRole('button', { name: 'Find and replace' }));
    await user().type(screen.getByLabelText('Find'), 'Mai');

    expect(document.querySelectorAll('.find-hits mark.find-hit')).toHaveLength(2);
    expect(textBox()).toHaveClass('chapter-text--finding');

    await user().click(screen.getByRole('button', { name: 'Find and replace' }));

    expect(document.querySelector('.find-hits')).toBeNull();
    expect(textBox()).not.toHaveClass('chapter-text--finding');
  });

  it('keeps the marks in step with the find box and with edits to the text', async () => {
    renderPage([get({ text: 'Mai gặp Nam. Mai cười.' })]);
    await loaded();
    await user().click(screen.getByRole('button', { name: 'Find and replace' }));
    await user().type(screen.getByLabelText('Find'), 'Nam');
    expect(document.querySelectorAll('.find-hits mark.find-hit')).toHaveLength(1);

    await user().type(textBox(), ' Nam');
    expect(document.querySelectorAll('.find-hits mark.find-hit')).toHaveLength(2);
    expect(document.querySelectorAll('.find-hits mark.find-hit--current')).toHaveLength(1);

    await user().clear(screen.getByLabelText('Find'));
    expect(document.querySelector('.find-hits')).toBeNull();
  });

  it('the find panel sits inside the sticky chapter bar', async () => {
    renderPage([get()]);
    await loaded();

    await user().click(screen.getByRole('button', { name: 'Find and replace' }));

    expect(screen.getByRole('search', { name: 'Find and replace' }).closest('.chapter-bar')).not.toBeNull();
  });

  it('the find tool is a ghost button', async () => {
    renderPage([get()]);
    await loaded();

    expect(screen.getByRole('button', { name: 'Find and replace' })).toHaveClass('button--ghost');
  });

  it('opens with Ctrl+H and Cmd+H, preventing the browser history', async () => {
    renderPage([get()]);
    await loaded();

    const e = ctrl('h');
    expect(e.defaultPrevented).toBe(true);
    expect(await screen.findByRole('search', { name: 'Find and replace' })).toBeInTheDocument();
    cleanup();

    renderPage([get()]);
    await loaded();
    ctrl('h', { ctrlKey: false, metaKey: true });
    expect(await screen.findByRole('search', { name: 'Find and replace' })).toBeInTheDocument();
  });

  it('Esc closes the panel and puts the focus back in the text', async () => {
    renderPage([get()]);
    await loaded();
    await user().click(screen.getByRole('button', { name: 'Find and replace' }));

    await user().keyboard('{Escape}');

    expect(screen.queryByRole('search', { name: 'Find and replace' })).not.toBeInTheDocument();
    expect(textBox()).toHaveFocus();
  });

  it('Replace all changes the text, leaves the chapter unsaved and Undo brings it back', async () => {
    renderPage([get({ text: 'Mai và Mai' })]);
    await loaded();
    await user().click(screen.getByRole('button', { name: 'Find and replace' }));
    await user().type(screen.getByLabelText('Find'), 'Mai');
    await user().type(screen.getByLabelText('Replace with'), 'Lan');

    await user().click(screen.getByRole('button', { name: 'Replace all' }));

    expect(textBox()).toHaveValue('Lan và Lan');
    expect(state()).toHaveTextContent('Unsaved changes');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('button--primary');
    expect(toast.success).toHaveBeenCalledWith('Replaced 2', expect.objectContaining({ action: expect.anything() }));
    act(() => (vi.mocked(toast.success).mock.calls.at(-1)![1]!.action as unknown as { onClick: () => void }).onClick());
    expect(textBox()).toHaveValue('Mai và Mai');
    expect(state()).toHaveTextContent('');
  });

  it('has a tooltip on the find button, has no scene break button, and disables find while a translation runs', async () => {
    renderPage([get()]);
    await loaded();
    await expectTooltip(screen.getByRole('button', { name: 'Find and replace' }), 'Find and replace');
    expect(screen.queryByRole('button', { name: 'Insert scene break' })).not.toBeInTheDocument();
    cleanup();

    renderPage([get({ translationStatus: 'TRANSLATING' })]);
    await loaded();
    expect(screen.getByRole('button', { name: 'Find and replace' })).toBeDisabled();
  });
});

describe('ChapterPage editor CSS cannot stop the textarea growing', () => {
  it('sets no height or max-height on the editor textarea, and hides its overflow', () => {
    const rules = [...css.matchAll(/([^{}]*\.chapter-text[^{}]*textarea[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector, body] of rules) {
      expect(body, selector.trim()).not.toMatch(/(^|[;\s])(max-height|height)\s*:/);
    }
    expect(css).toMatch(/\.chapter-text textarea\s*\{[^}]*overflow-y:\s*hidden/);
  });
});

describe('ChapterPage bar title', () => {
  it('shows the short name in the bar, not the long title the H1 already has', async () => {
    renderPage([get({ chapterNo: 25, title: 'Chương 25: A very long chapter title that the H1 shows' })]);
    await screen.findByRole('heading', { level: 1 });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A very long chapter title');
    const title = document.querySelector('.chapter-bar__title')!;
    expect(title).toHaveTextContent(/^Chương 25$/);
  });

  it('shows a title without a colon whole', async () => {
    renderPage([get({ title: 'Ngoại truyện I' })]);
    await screen.findByRole('heading', { level: 1 });

    expect(document.querySelector('.chapter-bar__title')).toHaveTextContent(/^Ngoại truyện I$/);
  });
});

describe('ChapterPage two columns', () => {
  it('gives the original and the editor equal columns from 1024 px, each at most 72ch', () => {
    const block = css.slice(css.indexOf('@media (min-width: 1024px)', css.indexOf('.chapter-columns')));
    expect(block).toMatch(/\.chapter-columns\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/\.chapter-columns > \.chapter-original\s*\{[^}]*max-width:\s*72ch/);
    expect(css).toMatch(/\.chapter-text\s*\{[^}]*max-width:\s*72ch/);
  });

  it('keeps the original sticky just under the bar, scrolling on its own', () => {
    expect(css).toMatch(/--chapter-bar-h:\s*[\d.]+rem/);
    expect(css).toMatch(/\.chapter-original\s*\{[^}]*position:\s*sticky;[^}]*top:\s*var\(--chapter-bar-h\)/);
    expect(css).toMatch(/\.chapter-original__text\s*\{[^}]*max-height:\s*calc\(100vh - var\(--chapter-bar-h\)/);
  });

  it('uses the wide page for a chapter with an original beside it', async () => {
    renderPage([get({ pages: [], text: 'x', sourceText: 'Src', wattpadPartId: '1', sourceLanguage: 'en' })]);
    await loaded();

    expect(screen.getByRole('main')).toHaveClass('page--wide');
  });
});

describe('ChapterPage polling', () => {
  const getCalls = (calls: { method: string; path: string }[]) =>
    calls.filter((c) => c.method === 'GET' && c.path === '/api/chapters/9').length;
  afterEach(() => vi.useRealTimers());

  it('does not poll a chapter when nothing is running', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const calls = renderPage([get()]);
    await loaded();
    const before = getCalls(calls);

    await vi.advanceTimersByTimeAsync(7000);

    expect(getCalls(calls)).toBe(before);
  });
});

describe('ChapterPage of an original story', () => {
  const story = (over: Partial<ChapterDetail> = {}): FakeRoute =>
    get({
      sourceType: 'ORIGINAL',
      sourceLanguage: 'vi',
      pages: [],
      text: 'Đoạn một.\n\nĐoạn hai.',
      translationStatus: 'NONE',
      translationModel: null,
      sourceText: null,
      ...over,
    });

  it('originalChapterHasNoOriginalPanelOrTranslate: no Original panel, pages, Translate or translation chip', async () => {
    stubWide(true);
    renderPage([story()]);
    await loaded();

    expect(screen.queryByRole('region', { name: 'Original text' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pages' })).not.toBeInTheDocument();
    expect(screen.queryByText('Not translated')).not.toBeInTheDocument();
    expect(screen.queryByText('Translated')).not.toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    // Nothing in the bar's menu can translate: it holds Publish and Export chapter.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Chapter actions' }));
    expect(screen.queryByRole('button', { name: /Translate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reload original' })).not.toBeInTheDocument();
  });

  it('originalChapterHasCheckAndAddRule: Check, Add to check rules, Find and Save stay', async () => {
    renderPage([story()]);
    await loaded();

    expect(screen.getByRole('button', { name: 'Check' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to check rules' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find and replace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(await menuItem('Publish')).toBeInTheDocument();
    expect(textBox()).toHaveValue('Đoạn một.\n\nĐoạn hai.');
  });

  it('keeps Unpublish in the menu of a published original chapter', async () => {
    renderPage([story({ publishStatus: 'PUBLISHED' })]);
    await loaded();

    expect(await menuItem('Unpublish')).toBeInTheDocument();
    expect(screen.queryByText(/Unpublish to change pages or translate again/)).not.toBeInTheDocument();
  });
});

describe('ChapterPage: Sync from Wattpad', () => {
  const linked = (over: Partial<ChapterDetail> = {}): FakeRoute =>
    get({
      sourceType: 'ORIGINAL', sourceLanguage: 'vi', pages: [], text: 'Old text', translationStatus: 'NONE',
      translationModel: null, sourceText: null, wattpadLinked: true, ...over,
    });
  const parts: FakeRoute = {
    method: 'GET', path: '/api/novels/3/wattpad/parts', status: 200,
    body: [{ partId: '7', title: 'Chapter 1: Mở đầu', wordCount: 10, createdAt: null, modifiedAt: null, deleted: false, importedChapterId: null }],
  };

  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
  });

  it('is in the menu of an original chapter with a link, and not without one or for another kind', async () => {
    renderPage([linked()]);
    await loaded();
    expect(await menuItemNames()).toContain('Sync from Wattpad');
    cleanup();

    renderPage([linked({ wattpadLinked: false })]);
    await loaded();
    expect(await menuItemNames()).not.toContain('Sync from Wattpad');
    cleanup();

    renderPage([get()]);
    await loaded();
    expect(await menuItemNames()).not.toContain('Sync from Wattpad');
  });

  it('is dimmed with a reason on a published chapter', async () => {
    renderPage([linked({ publishStatus: 'PUBLISHED' })]);
    await loaded();

    const item = await menuItem('Sync from Wattpad');

    expect(item).toBeDisabled();
    await expectTooltip(item.parentElement!, 'Unpublish to sync from Wattpad.');
  });

  it('shows when the chapter was synced, nothing when never, and updates it after a sync', async () => {
    renderPage([linked(), parts, { method: 'POST', path: '/api/chapters/9/wattpad-sync', status: 200, body: chapterDetail({
      sourceType: 'ORIGINAL', sourceLanguage: 'vi', pages: [], text: 'Fresh', translationStatus: 'NONE', translationModel: null,
      sourceText: null, wattpadLinked: true, sourceFetchedAt: '2026-11-28T03:30:00Z' }) }]);
    await loaded();
    expect(screen.queryByText(/Synced from Wattpad/)).not.toBeInTheDocument();
    const u = userEvent.setup();

    await chooseAction('Sync from Wattpad');
    const dialog = await screen.findByRole('dialog', { name: 'Sync from Wattpad' });
    await within(dialog).findByRole('radio', { name: /Chapter 1: Mở đầu/ });
    await u.click(within(dialog).getByRole('button', { name: 'Sync' }));
    await u.click(within(dialog).getByRole('button', { name: 'Replace text' }));

    expect(await screen.findByText('Synced from Wattpad 28/11/2026 10:30')).toBeInTheDocument();
    expect(screen.queryByText(/Fetched from Wattpad/)).not.toBeInTheDocument();
  });

  it('shows the synced time on load', async () => {
    renderPage([linked({ sourceFetchedAt: '2026-11-28T03:30:00Z' })]);
    await loaded();

    expect(screen.getByText('Synced from Wattpad 28/11/2026 10:30')).toBeInTheDocument();
  });

  it('replaces the editor text with the synced chapter, dropping unsaved edits, and says so', async () => {
    const calls = renderPage([
      linked(),
      parts,
      { method: 'POST', path: '/api/chapters/9/wattpad-sync', status: 200, body: chapterDetail({
        sourceType: 'ORIGINAL', sourceLanguage: 'vi', pages: [], text: 'Fresh from Wattpad', translationStatus: 'NONE',
        translationModel: null, sourceText: null, wattpadLinked: true }) },
    ]);
    await loaded();
    const u = userEvent.setup();
    await u.type(textBox(), ' unsaved');

    await chooseAction('Sync from Wattpad');
    const dialog = await screen.findByRole('dialog', { name: 'Sync from Wattpad' });
    await within(dialog).findByRole('radio', { name: /Chapter 1: Mở đầu/ });
    await u.click(within(dialog).getByRole('button', { name: 'Sync' }));
    await u.click(within(dialog).getByRole('button', { name: 'Replace text' }));

    await waitFor(() => expect(textBox()).toHaveValue('Fresh from Wattpad'));
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/chapters/9/wattpad-sync')).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('Synced from Wattpad');
    expect(screen.queryByRole('dialog', { name: 'Sync from Wattpad' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chapter 1: Mở đầu' })).toBeInTheDocument();
  });
});
