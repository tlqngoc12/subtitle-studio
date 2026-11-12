import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import type { NovelSource } from '../../data/novelSource';
import type { PublicChapterFile, PublicNovelDetail } from '../../data/novelTypes';
import { expectTooltip } from '../../test/tooltip';
import ReaderPage from './ReaderPage';
import { css } from '../../test/css';


/** Pretends the page was scrolled to `y` and tells the listeners. */
function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  fireEvent.scroll(window);
}

/** Body of the first CSS rule whose selector is exactly `selector` (string search; no regex escapes). */
function ruleBody(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule for ${selector}`);
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
}

const bar = () => screen.getByRole('navigation', { name: 'Chuyển chương' });

async function openSettings(user = userEvent.setup()) {
  await user.click(screen.getByRole('button', { name: 'Cài đặt' }));
  return user;
}

const NOVEL: PublicNovelDetail = {
  slug: 'summer',
  title: 'Tình Yêu Mùa Hạ',
  coverUrl: null,
  originalAuthor: null,
  description: null,
  tags: [],
  novelStatus: 'ONGOING',
  translatorCredit: null,
  sourceUrl: null,
  chapters: [
    { chapterNo: 1, title: 'Mở đầu' },
    { chapterNo: 3, title: 'Mưa' },
    { chapterNo: 4, title: null, label: 'Special' },
  ],
};

const LINKS: Record<number, [number | null, number | null]> = { 1: [null, 3], 3: [1, 4], 4: [3, null] };

function chapter(no: number): PublicChapterFile {
  const [prev, next] = LINKS[no];
  return {
    chapterNo: no,
    title: no === 3 ? 'Mưa' : no === 1 ? 'Mở đầu' : null,
    label: no === 4 ? 'Special' : null,
    prev,
    next,
    images: ['/novels/summer/h-1.webp', '/novels/summer/h-2.webp', '/novels/summer/h-3.webp'],
  };
}

const source: NovelSource = {
  listNovels: async () => [],
  getNovel: async () => NOVEL,
  getChapter: async (_slug, no) => chapter(no),
};

function renderAt(path: string, s: NovelSource = source) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/novels/:slug" element={<p>novel page</p>} />
        <Route path="/novels/:slug/:chapterNo" element={<ReaderPage source={s} />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  scrollTo(0);
});
afterEach(() => {
  document.title = '';
  document.documentElement.removeAttribute('data-theme');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ReaderPage page format and theme', () => {
  const FORMATS = [
    { key: 's' as const, width: 1080, height: 1600, images: ['/s-1.webp', '/s-2.webp'] },
    { key: 'm' as const, width: 820, height: 1215, images: ['/m-1.webp', '/m-2.webp'] },
    { key: 'l' as const, width: 640, height: 948, images: ['/l-1.webp', '/l-2.webp'] },
  ];
  const fmtSource: NovelSource = {
    ...source,
    getChapter: async (_s, no) => ({ ...chapter(no), formats: FORMATS }),
  };

  it('renders the m images on a compact screen', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }));
    renderAt('/novels/summer/3', fmtSource);
    const imgs = await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['/m-1.webp', '/m-2.webp']);
  });

  it('sets data-reader-theme from the stored theme', async () => {
    localStorage.setItem('reader-theme', 'oled');
    const { container } = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    expect(container.querySelector('main')).toHaveAttribute('data-reader-theme', 'oled');
    expect(document.documentElement.dataset.readerTheme).toBe('oled');
  });

  it('clears the html theme attribute on unmount', async () => {
    const { unmount } = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    unmount();
    expect(document.documentElement.dataset.readerTheme).toBeUndefined();
  });

  it('img aspect-ratio follows the picked format', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }));
    renderAt('/novels/summer/3', fmtSource);
    const imgs = await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    expect(imgs[0].style.aspectRatio).toBe('auto 820 / 1215');
  });
});

describe('ReaderPage', () => {
  it('shows every page image, not draggable, the first eager and the rest lazy', async () => {
    renderAt('/novels/summer/3');

    const images = await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    expect(images).toHaveLength(3);
    expect(images[1]).toHaveAccessibleName('Chương 3, trang 2/3');
    expect(images[1]).toHaveAttribute('src', '/novels/summer/h-2.webp');
    expect(images[1]).toHaveAttribute('draggable', 'false');
    expect(images[0]).toHaveAttribute('loading', 'eager');
    expect(images[1]).toHaveAttribute('loading', 'lazy');
    expect(images[2]).toHaveAttribute('loading', 'lazy');
  });

  it('says it is loading until the chapter resolves', async () => {
    let resolve!: (c: PublicChapterFile) => void;
    const slow: NovelSource = { ...source, getChapter: () => new Promise((r) => (resolve = r)) };
    renderAt('/novels/summer/3', slow);

    expect(screen.getByText('Đang tải chương…')).toBeInTheDocument();
    await act(async () => resolve(chapter(3)));

    expect(screen.queryByText('Đang tải chương…')).not.toBeInTheDocument();
    expect(await screen.findAllByRole('img', { name: /Chương 3, trang/ })).toHaveLength(3);
  });

  it('shows the chapter name in the breadcrumb only; the heading is visually hidden', async () => {
    renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });

    const heading = screen.getByRole('heading', { name: 'Chương 3: Mưa' });
    expect(heading).toHaveClass('visually-hidden');
    expect(screen.queryByLabelText('Danh sách chương')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('Chapter')).not.toBeInTheDocument();
  });

  it('names a labelled chapter by its label', async () => {
    renderAt('/novels/summer/4');

    expect(await screen.findByRole('heading', { name: 'Special' })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /^Special, trang/ })).toHaveLength(3);
  });

  it('shows Novels > novel title > chapter name as a breadcrumb', async () => {
    renderAt('/novels/summer/4');
    await screen.findAllByRole('img', { name: /^Special, trang/ });

    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const links = within(crumbs).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Novels', 'Tình Yêu Mùa Hạ']);
    expect(links[0]).toHaveAttribute('href', '/novels');
    expect(links[1]).toHaveAttribute('href', '/novels/summer');
    const last = within(crumbs).getByText('Special');
    expect(last).toHaveAttribute('aria-current', 'page');
    expect(last.closest('a')).toBeNull();
    expect(crumbs.querySelectorAll('svg')).toHaveLength(2); // ChevronRight separators
    expect(screen.queryByRole('link', { name: /^←/ })).not.toBeInTheDocument();
  });

  it('has a sticky icon bar with previous, next, contents and settings, each with a tooltip', async () => {
    renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });

    const prev = within(bar()).getByRole('link', { name: 'Chương trước' });
    const next = within(bar()).getByRole('link', { name: 'Chương sau' });
    expect(prev).toHaveAttribute('href', '/novels/summer/1');
    expect(next).toHaveAttribute('href', '/novels/summer/4');
    const toc = within(bar()).getByRole('button', { name: 'Mục lục' });
    const settings = within(bar()).getByRole('button', { name: 'Cài đặt' });
    for (const [el, tip] of [
      [prev, 'Chương trước'],
      [next, 'Chương sau'],
      [toc, 'Mục lục'],
      [settings, 'Cài đặt'],
    ] as const) {
      expect(el.textContent?.trim()).toBe('');
      expect(el.querySelector('svg')).not.toBeNull();
      await expectTooltip(el, tip);
    }
    // Neither the old orange step buttons nor a select any more.
    expect(bar().querySelector('.button--primary')).toBeNull();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows the novel title, the chapter name without its title and a back link on the left of the bar', async () => {
    renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });

    const back = within(bar()).getByRole('link', { name: 'Về trang truyện' });
    expect(back).toHaveAttribute('href', '/novels/summer');
    expect(back.querySelector('svg')).not.toBeNull();
    await expectTooltip(back, 'Về trang truyện');
    const title = bar().querySelector('.reader-bar__novel');
    const name = bar().querySelector('.reader-bar__chapter');
    expect(title).toHaveTextContent('Tình Yêu Mùa Hạ');
    expect(name?.textContent).toBe('Chương 3');
    expect(bar()).not.toHaveTextContent('Mưa');
  });

  it('names a labelled chapter by its label in the bar', async () => {
    renderAt('/novels/summer/4');
    await screen.findAllByRole('img', { name: /Special, trang/ });

    expect(bar().querySelector('.reader-bar__chapter')?.textContent).toBe('Special');
  });

  it('lays the bar text out on the left with ellipsis, and the size radio resizes the page column', async () => {
    const { container } = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });

    expect(/\.reader-bar__text\s*\{[^}]*min-width:\s*0/.test(css)).toBe(true);
    expect(/\.reader-bar__novel,\s*\.reader-bar__chapter\s*\{[^}]*text-overflow:\s*ellipsis/.test(css)).toBe(true);
    const column = container.querySelector('.reader-page') as HTMLElement;
    expect(column.style.getPropertyValue('--reader-width')).toBe('640px');
    expect(column.contains(container.querySelector('.reader'))).toBe(true);
    await openSettings();
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Chữ lớn' }));
    expect(column.style.getPropertyValue('--reader-width')).toBe('720px');
  });

  it('disables (does not hide) previous on the first chapter and next on the last', async () => {
    const first = renderAt('/novels/summer/1');
    await screen.findAllByRole('img', { name: /Chương 1, trang/ });
    expect(within(bar()).getByRole('button', { name: 'Chương trước' })).toBeDisabled();
    expect(within(bar()).getByRole('link', { name: 'Chương sau' })).toBeInTheDocument();
    first.unmount();

    renderAt('/novels/summer/4');
    await screen.findAllByRole('img', { name: /^Special, trang/ });
    expect(within(bar()).getByRole('button', { name: 'Chương sau' })).toBeDisabled();
    expect(within(bar()).getByRole('link', { name: 'Chương trước' })).toBeInTheDocument();
  });

  it('keeps the bar outside the copy-guarded reader', async () => {
    const { container } = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });

    expect(container.querySelector('.reader')!.contains(bar())).toBe(false);
  });

  describe('table of contents', () => {
    it('lists the chapters, marks the one being read and the read ones, and scrolls to the current one', async () => {
      localStorage.setItem('novel-read:summer', JSON.stringify([1]));
      const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
      renderAt('/novels/summer/3');
      await screen.findAllByRole('img', { name: /Chương 3, trang/ });

      await userEvent.setup().click(screen.getByRole('button', { name: 'Mục lục' }));
      const list = await screen.findByRole('list', { name: 'Danh sách chương' });
      const items = within(list).getAllByRole('listitem');
      expect(items.map((li) => li.textContent)).toEqual(['Chương 1: Mở đầu', 'Chương 3: MưaĐang đọc', 'Special']);
      expect(within(items[0]).getByRole('img', { name: 'Đã đọc' })).toBeInTheDocument();
      expect(within(items[1]).getByText('Đang đọc')).toBeInTheDocument();
      expect(within(items[1]).getByRole('link')).toHaveAttribute('aria-current', 'true');
      expect(within(items[2]).queryByText('Đang đọc')).not.toBeInTheDocument();
      expect(scroll.mock.contexts.some((el) => el === within(items[1]).getByRole('link'))).toBe(true);
    });

    it('navigates to the picked chapter and closes', async () => {
      const user = userEvent.setup();
      renderAt('/novels/summer/3');
      await screen.findAllByRole('img', { name: /Chương 3, trang/ });

      await user.click(screen.getByRole('button', { name: 'Mục lục' }));
      await user.click(
        within(await screen.findByRole('list', { name: 'Danh sách chương' })).getByRole('link', { name: 'Special' }),
      );

      expect(await screen.findAllByRole('img', { name: /^Special, trang/ })).toHaveLength(3);
      await waitFor(() => expect(screen.queryByRole('list', { name: 'Danh sách chương' })).not.toBeInTheDocument());
    });

    it('is a labelled modal dialog drawer with its own scrolling body, closed by the close button', async () => {
      const user = userEvent.setup();
      renderAt('/novels/summer/3');
      await screen.findAllByRole('img', { name: /Chương 3, trang/ });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      const trigger = screen.getByRole('button', { name: 'Mục lục' });
      await user.click(trigger);
      const drawer = await screen.findByRole('dialog', { name: 'Mục lục' });
      expect(within(drawer).getByRole('heading', { name: 'Mục lục' })).toBeInTheDocument();
      expect(drawer).toHaveAttribute('data-own-keys');
      const body = drawer.querySelector('.drawer__body') as HTMLElement;
      expect(body).not.toBeNull();
      expect(within(body).getByRole('list', { name: 'Danh sách chương' })).toBeInTheDocument();
      expect(within(drawer).getByRole('button', { name: 'Đóng' })).toBeInTheDocument();
      // The page behind is inert for assistive tech while the drawer is open.
      expect(screen.queryByRole('navigation', { name: 'Chuyển chương' })).toBeNull();

      await user.click(within(drawer).getByRole('button', { name: 'Đóng' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
    });

    it('closes with Escape and returns focus to the contents button', async () => {
      const user = userEvent.setup();
      renderAt('/novels/summer/3');
      await screen.findAllByRole('img', { name: /Chương 3, trang/ });
      const trigger = screen.getByRole('button', { name: 'Mục lục' });

      await user.click(trigger);
      await screen.findByRole('dialog', { name: 'Mục lục' });
      await user.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
    });

    it('closes when the dimmed overlay is clicked', async () => {
      const user = userEvent.setup();
      renderAt('/novels/summer/3');
      await screen.findAllByRole('img', { name: /Chương 3, trang/ });
      await user.click(screen.getByRole('button', { name: 'Mục lục' }));
      await screen.findByRole('dialog', { name: 'Mục lục' });

      await user.click(document.querySelector('.drawer__overlay') as HTMLElement);

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Mục lục' })).toHaveFocus();
    });

    it('traps focus inside the drawer', async () => {
      const user = userEvent.setup();
      renderAt('/novels/summer/3');
      await screen.findAllByRole('img', { name: /Chương 3, trang/ });
      await user.click(screen.getByRole('button', { name: 'Mục lục' }));
      const drawer = await screen.findByRole('dialog', { name: 'Mục lục' });

      for (let i = 0; i < 12; i++) {
        await user.tab();
        expect(drawer.contains(document.activeElement)).toBe(true);
      }
    });

    it('styles a full-height right-side drawer with its own visible scrollbar, no animation for reduced motion', () => {
      const drawer = ruleBody('.drawer');
      expect(drawer).toContain('position: fixed');
      expect(drawer).toContain('right: 0');
      expect(drawer).toContain('height: 100dvh');
      expect(drawer).toContain('width: min(360px, 85vw)');
      expect(drawer).toContain('background: var(--surface)');
      expect(drawer).toContain('border-left: 1px solid');
      expect(drawer).toContain('box-shadow: var(--shadow-overlay)');
      expect(ruleBody('.drawer__overlay')).toContain('var(--scrim)');
      const body = ruleBody('.drawer__body');
      expect(body).toContain('overflow-y: auto');
      expect(body).toContain('scrollbar-width: thin');
      expect(body).toContain('scrollbar-color:');
      expect(css).toContain('@keyframes drawer-in');
      expect(css).toContain('translateX(100%)');
      const reduced = css.slice(css.indexOf('prefers-reduced-motion: reduce', css.indexOf('.reader-toc__item--current')));
      expect(reduced.slice(0, 120)).toContain('animation: none');
    });

    it('does not turn the arrow keys into chapter changes while focus is in the list', async () => {
      const user = userEvent.setup();
      renderAt('/novels/summer/3');
      await screen.findAllByRole('img', { name: /Chương 3, trang/ });
      await user.click(screen.getByRole('button', { name: 'Mục lục' }));
      const list = await screen.findByRole('list', { name: 'Danh sách chương' });

      within(list).getByRole('link', { name: 'Special' }).focus();
      await user.keyboard('{ArrowRight}{ArrowLeft}');

      expect(screen.getAllByRole('img', { name: /Chương 3, trang/, hidden: true })).toHaveLength(3);
      expect(screen.queryByRole('img', { name: /^Special, trang/, hidden: true })).not.toBeInTheDocument();
    });
  });

  // Hiding on scroll moved with the controls into the top bar: see ReaderTopbar.test.tsx.

  it('ends a chapter with Chương trước and Chương sau as orange primary buttons in the two corners', async () => {
    renderAt('/novels/summer/3');

    const end = await screen.findByRole('region', { name: 'Hết chương' });
    const prev = within(end).getByRole('link', { name: /Chương trước/ });
    const next = within(end).getByRole('link', { name: /Chương sau/ });
    expect(prev).toHaveAttribute('href', '/novels/summer/1');
    expect(next).toHaveAttribute('href', '/novels/summer/4');
    // Same style; only next carries its column modifier.
    expect(prev.className).toBe(next.className.replace(' reader__end-button--next', ''));
    expect(prev).toHaveClass('button', 'button--primary');
    expect(next).toHaveClass('button', 'button--primary');
    expect(ruleBody('.reader__end')).toContain('max-width: var(--reader-width');
    expect(ruleBody('.reader__end-nav .reader__end-button')).toContain('justify-self: start');
    const nextCorner = ruleBody('.reader__end-nav .reader__end-button--next');
    expect(nextCorner).toContain('grid-column: 2');
    expect(nextCorner).toContain('justify-self: end');
    expect(next).not.toHaveTextContent('Special'); // no big next-chapter card
    expect(end.querySelector('.reader__next-card')).toBeNull();
    // prev left, next right
    expect(prev.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps next in the second column when there is no previous chapter', async () => {
    renderAt('/novels/summer/1');

    const end = await screen.findByRole('region', { name: 'Hết chương' });
    expect(within(end).queryByRole('link', { name: /Chương trước/ })).not.toBeInTheDocument();
    expect(within(end).getByRole('link', { name: /Chương sau/ })).toBeInTheDocument();
    expect(end.querySelectorAll('.reader__end-nav > *')).toHaveLength(1);
    const nextRule = /\.reader__end-button--next\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(nextRule).toMatch(/grid-column:\s*2/);
    expect(nextRule).toMatch(/justify-self:\s*end/);
  });

  it('leaves the right corner empty when there is no next chapter', async () => {
    renderAt('/novels/summer/4');

    const end = await screen.findByRole('region', { name: 'Hết chương' });
    expect(end.querySelectorAll('.reader__end-nav > *')).toHaveLength(1);
    expect(within(end).getByRole('link', { name: /Chương trước/ })).toHaveClass('button--primary');
  });

  it('ends the last chapter with a "read everything" box', async () => {
    renderAt('/novels/summer/4');

    const end = await screen.findByRole('region', { name: 'Hết chương' });
    expect(within(end).getByText('Bạn đã đọc hết các chương đã đăng.')).toBeInTheDocument();
    expect(within(end).getByRole('link', { name: 'Về trang truyện' })).toHaveAttribute('href', '/novels/summer');
    expect(within(end).queryByRole('link', { name: /Chương sau/ })).not.toBeInTheDocument();
    expect(within(end).getByRole('link', { name: /Chương trước/ })).toBeInTheDocument();
  });

  it('opens the next chapter with ArrowRight and the previous with ArrowLeft', async () => {
    const user = userEvent.setup();
    renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });

    await user.keyboard('{ArrowRight}');
    expect(await screen.findAllByRole('img', { name: /^Special, trang/ })).toHaveLength(3);

    await user.keyboard('{ArrowLeft}');
    expect(await screen.findAllByRole('img', { name: /Chương 3, trang/ })).toHaveLength(3);
  });

  it('ignores the arrows with a modifier key and at the ends', async () => {
    const user = userEvent.setup();
    renderAt('/novels/summer/1');
    await screen.findAllByRole('img', { name: /Chương 1, trang/ });

    await user.keyboard('{ArrowLeft}');
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    await user.keyboard('{Control>}{ArrowRight}{/Control}');

    expect(screen.getAllByRole('img', { name: /Chương 1, trang/ })).toHaveLength(3);
  });

  it('ignores arrows typed in a form field', async () => {
    renderAt('/novels/summer/1');
    await screen.findAllByRole('img', { name: /Chương 1, trang/ });
    const field = document.createElement('input');
    document.body.append(field);

    fireEvent.keyDown(field, { key: 'ArrowRight' });

    expect(screen.getAllByRole('img', { name: /Chương 1, trang/ })).toHaveLength(3);
    field.remove();
  });

  it('sets the tab title and restores it on unmount', async () => {
    document.title = 'before';
    const { unmount } = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });

    expect(document.title).toBe('Chương 3: Mưa · Tình Yêu Mùa Hạ');
    unmount();
    expect(document.title).toBe('before');
  });

  it('shows a Vietnamese notice when the chapter cannot be loaded', async () => {
    renderAt('/novels/summer/9', {
      ...source,
      getChapter: async () => {
        throw new ApiError(404, 'CHAPTER_NOT_FOUND', 'x');
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được. Vui lòng thử lại sau.');
  });

  it('falls back to a plain novel crumb before the novel is loaded', async () => {
    renderAt('/novels/summer/3', { ...source, getNovel: () => new Promise(() => {}) });

    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Về trang truyện' })).toHaveAttribute('href', '/novels/summer');
  });

  it('shows the print note in Vietnamese', async () => {
    renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });

    expect(screen.getByText('Không hỗ trợ in trang này.')).toBeInTheDocument();
  });

  it('blocks the context menu on the pages', async () => {
    renderAt('/novels/summer/3');
    const images = await screen.findAllByRole('img', { name: /Chương 3, trang/ });

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    images[0].dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});

describe('ReaderPage preferences', () => {
  const reader = (container: HTMLElement) => container.querySelector('.reader') as HTMLElement;

  it('stores the reading position and the chapters opened', async () => {
    renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });

    expect(JSON.parse(localStorage.getItem('novel-progress:summer')!)).toEqual({ chapterNo: 3 });
    expect(JSON.parse(localStorage.getItem('novel-read:summer')!)).toEqual([3]);

    await userEvent.setup().click(within(bar()).getByRole('link', { name: 'Chương sau' }));
    await screen.findAllByRole('img', { name: /^Special, trang/ });

    expect(JSON.parse(localStorage.getItem('novel-progress:summer')!)).toEqual({ chapterNo: 4 });
    expect(JSON.parse(localStorage.getItem('novel-read:summer')!)).toEqual([3, 4]);
  });

  const main = (container: HTMLElement) => container.querySelector('main') as HTMLElement;

  it('renders with defaults when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const user = userEvent.setup();
    const { container } = renderAt('/novels/summer/3');

    expect(await screen.findAllByRole('img', { name: /Chương 3, trang/ })).toHaveLength(3);
    expect(reader(container)).toHaveAttribute('data-width', '640');
    await openSettings(user);
    expect(screen.getByRole('radio', { name: 'Giấy' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Tối' }));
    await user.click(screen.getByRole('radio', { name: 'Chữ lớn' }));
    expect(screen.getByRole('radio', { name: 'Tối' })).toBeChecked();
    expect(reader(container)).toHaveAttribute('data-width', '720');
  });

  it('switches the theme from the swatches and remembers it', async () => {
    const user = userEvent.setup();
    const { container, unmount } = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    await openSettings(user);

    expect(main(container)).toHaveAttribute('data-reader-theme', 'sepia');
    await user.click(screen.getByRole('radio', { name: 'Tối' }));
    expect(main(container)).toHaveAttribute('data-reader-theme', 'dark');
    expect(localStorage.getItem('reader-theme')).toBe('dark');

    unmount();
    const again = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    expect(main(again.container)).toHaveAttribute('data-reader-theme', 'dark');
    await openSettings(user);
    expect(screen.getByRole('radio', { name: 'Tối' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Đen OLED' }));
    expect(localStorage.getItem('reader-theme')).toBe('oled');
  });

  it('defaults to the dark theme when the app theme is dark, and a stored theme overrides it', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const dark = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    expect(main(dark.container)).toHaveAttribute('data-reader-theme', 'dark');
    dark.unmount();

    localStorage.setItem('reader-theme', 'light');
    const overridden = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    expect(main(overridden.container)).toHaveAttribute('data-reader-theme', 'light');
  });

  it('keeps the theme when the window is inactive', async () => {
    localStorage.setItem('reader-theme', 'oled');
    const { container } = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });

    fireEvent(window, new Event('blur'));

    expect(main(container)).toHaveAttribute('data-reader-theme', 'oled');
    expect(reader(container)).toHaveClass('reader--hidden');
  });

  it('blurs through the theme filter and has no night class in the css', () => {
    expect(css).toContain('filter: var(--reader-img-filter) blur(24px)');
    expect(css).not.toContain('reader--night');
  });

  it('picks the size 560 / 640 / 720 and remembers it', async () => {
    const user = userEvent.setup();
    const { container, unmount } = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    await openSettings(user);

    expect(reader(container)).toHaveAttribute('data-width', '640');
    await user.click(screen.getByRole('radio', { name: 'Chữ lớn' }));
    expect(reader(container)).toHaveAttribute('data-width', '720');
    expect(localStorage.getItem('reader-size')).toBe('2');
    await user.click(screen.getByRole('radio', { name: 'Chữ nhỏ' }));
    expect(reader(container)).toHaveAttribute('data-width', '560');

    unmount();
    const again = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    expect(reader(again.container)).toHaveAttribute('data-width', '560');
  });

  it('keeps the preference buttons outside the copy-guarded reader', async () => {
    const { container } = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    await openSettings();

    expect(reader(container).contains(screen.getByRole('radio', { name: 'Tối' }))).toBe(false);
    expect(reader(container).contains(screen.getByRole('radio', { name: 'Chữ lớn' }))).toBe(false);
  });
});

describe('ReaderPage mobile controls', () => {
  function compact(on: boolean) {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: on && q.includes('max-width'),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
  }
  const shield = (c: HTMLElement) => c.querySelector('.reader__shield') as HTMLElement;
  const bottom = () => document.querySelector('.reader-bottom');

  it('tap in the middle toggles the bars', async () => {
    compact(true);
    vi.stubGlobal('innerHeight', 800);
    const { container } = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    expect(bottom()).not.toHaveAttribute('data-hidden');
    fireEvent.click(shield(container), { clientY: 400 });
    expect(bottom()).toHaveAttribute('data-hidden');
    fireEvent.click(shield(container), { clientY: 400 });
    expect(bottom()).not.toHaveAttribute('data-hidden');
  });

  it('tap in the bottom quarter scrolls down, top quarter scrolls up', async () => {
    compact(true);
    vi.stubGlobal('innerHeight', 800);
    const spy = vi.fn();
    vi.stubGlobal('scrollBy', spy);
    const { container } = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    fireEvent.click(shield(container), { clientY: 700 });
    expect(spy).toHaveBeenLastCalledWith({ top: 720, behavior: 'smooth' });
    fireEvent.click(shield(container), { clientY: 50 });
    expect(spy).toHaveBeenLastCalledWith({ top: -720, behavior: 'smooth' });
  });

  it('tapping the slider or a bar button does not toggle or scroll', async () => {
    compact(true);
    vi.stubGlobal('innerHeight', 800);
    const spy = vi.fn();
    vi.stubGlobal('scrollBy', spy);
    renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    fireEvent.click(screen.getByRole('slider', { name: 'Vị trí trong chương' }), { clientY: 700 });
    fireEvent.click(screen.getAllByRole('link', { name: 'Chương sau' })[0], { clientY: 700 });
    expect(bottom()).not.toHaveAttribute('data-hidden');
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows the position and opens the settings sheet from Aa', async () => {
    compact(true);
    renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    await waitFor(() => expect(screen.getByText('2/3')).toBeInTheDocument());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Hiển thị' }));
    expect(await screen.findByRole('dialog', { name: 'Hiển thị' })).toBeInTheDocument();
  });

  it('returns focus to the Aa button when the settings sheet closes', async () => {
    compact(true);
    renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    const user = userEvent.setup();
    const aa = screen.getByRole('button', { name: 'Hiển thị' });
    await user.click(aa);
    await screen.findByRole('dialog', { name: 'Hiển thị' });
    await user.click(within(screen.getByRole('dialog', { name: 'Hiển thị' })).getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Hiển thị' })).not.toBeInTheDocument());
    expect(aa).toHaveFocus();
  });

  it('bottom bar is not rendered on desktop', async () => {
    compact(false);
    renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    expect(bottom()).toBeNull();
    expect(document.querySelector('.reader-progress')).not.toBeNull();
  });
});

describe('ReaderPage loading and prefetch', () => {
  function spied() {
    const getChapter = vi.fn(source.getChapter);
    return { getChapter, s: { ...source, getChapter } as NovelSource };
  }
  /** Makes the reader 4000px tall and follows the fake scroll position. */
  function tall() {
    vi.stubGlobal('innerHeight', 800);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const height = this.classList.contains('reader') ? 4000 : 0;
      return { top: -window.scrollY, height, bottom: 0, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
    });
  }

  it('shows the skeleton and the chapter title from the novel while loading', async () => {
    renderAt('/novels/summer/3', { ...source, getChapter: () => new Promise(() => {}) });
    expect(document.querySelector('.reader-skeleton')).not.toBeNull();
    expect(screen.getByText('Đang tải chương…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: /Mưa/ })).toBeInTheDocument();
  });

  it('prefetches the next chapter once at 70%', async () => {
    tall();
    const { getChapter, s } = spied();
    renderAt('/novels/summer/3', s);
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    await new Promise((r) => setTimeout(r, 50));
    expect(getChapter).toHaveBeenCalledTimes(1);
    scrollTo(2000);
    await new Promise((r) => setTimeout(r, 50));
    expect(getChapter).toHaveBeenCalledTimes(1);
    scrollTo(2300);
    await waitFor(() => expect(getChapter).toHaveBeenCalledTimes(2));
    expect(getChapter).toHaveBeenLastCalledWith('summer', 4);
    scrollTo(3000);
    await new Promise((r) => setTimeout(r, 50));
    expect(getChapter).toHaveBeenCalledTimes(2);
  });

  it("does not prefetch from the previous chapter's progress after opening the next one", async () => {
    tall();
    const getChapter = vi.fn(async (slug: string, no: number) => {
      // The new chapter opens at its top, as the browser does, without a scroll event in between.
      if (no === 3) Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
      return source.getChapter(slug, no);
    });
    renderAt('/novels/summer/1', { ...source, getChapter } as NovelSource);
    await screen.findAllByRole('img', { name: /Chương 1, trang/ });
    scrollTo(3300);
    await waitFor(() => expect(getChapter).toHaveBeenCalledWith('summer', 3));
    getChapter.mockClear();
    fireEvent.click(screen.getAllByRole('link', { name: 'Chương sau' })[0]);
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    await new Promise((r) => setTimeout(r, 80));
    expect(getChapter).toHaveBeenCalledTimes(1);
    expect(getChapter).toHaveBeenCalledWith('summer', 3);
    expect(getChapter).not.toHaveBeenCalledWith('summer', 4);
  });

  it('prefetches at once when the chapter is shorter than the screen', async () => {
    const { getChapter, s } = spied();
    renderAt('/novels/summer/3', s);
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    await waitFor(() => expect(getChapter).toHaveBeenCalledWith('summer', 4));
  });

  it('no prefetch on the last chapter', async () => {
    const { getChapter, s } = spied();
    renderAt('/novels/summer/4', s);
    await screen.findAllByRole('img', { name: /trang/ });
    await new Promise((r) => setTimeout(r, 50));
    expect(getChapter).toHaveBeenCalledTimes(1);
  });
});
