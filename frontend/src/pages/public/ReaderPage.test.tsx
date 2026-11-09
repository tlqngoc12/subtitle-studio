import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import type { NovelSource } from '../../data/novelSource';
import type { PublicChapterFile, PublicNovelDetail } from '../../data/novelTypes';
import { expectTooltip } from '../../test/tooltip';
import ReaderPage from './ReaderPage';

const css = Object.values(import.meta.glob('../../styles.css', { query: '?raw', import: 'default', eager: true })).join('');

/** Pretends the page was scrolled to `y` and tells the listeners. */
function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  fireEvent.scroll(window);
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

    it('does not turn the arrow keys into chapter changes while focus is in the list', async () => {
      const user = userEvent.setup();
      renderAt('/novels/summer/3');
      await screen.findAllByRole('img', { name: /Chương 3, trang/ });
      await user.click(screen.getByRole('button', { name: 'Mục lục' }));
      const list = await screen.findByRole('list', { name: 'Danh sách chương' });

      within(list).getByRole('link', { name: 'Special' }).focus();
      await user.keyboard('{ArrowRight}{ArrowLeft}');

      expect(screen.getAllByRole('img', { name: /Chương 3, trang/ })).toHaveLength(3);
      expect(screen.queryByRole('img', { name: /^Special, trang/ })).not.toBeInTheDocument();
    });
  });

  describe('hiding on scroll', () => {
    const hidden = () => bar().classList.contains('reader-bar--hidden');

    it('hides after scrolling down past the bar and returns on scrolling up', async () => {
      renderAt('/novels/summer/3');
      await screen.findAllByRole('img', { name: /Chương 3, trang/ });
      expect(hidden()).toBe(false);

      scrollTo(40); // down, but still near the top
      expect(hidden()).toBe(false);
      scrollTo(400);
      expect(hidden()).toBe(true);
      scrollTo(300);
      expect(hidden()).toBe(false);
      scrollTo(700);
      expect(hidden()).toBe(true);
      scrollTo(20); // back at the top
      expect(hidden()).toBe(false);
    });

    it('stays visible while a popover is open', async () => {
      const user = userEvent.setup();
      renderAt('/novels/summer/3');
      await screen.findAllByRole('img', { name: /Chương 3, trang/ });

      await openSettings(user);
      scrollTo(900);
      expect(hidden()).toBe(false);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Chế độ đêm' })).not.toBeInTheDocument());
      act(() => (document.activeElement as HTMLElement).blur()); // Radix gives the focus back to the button
      scrollTo(1000);
      expect(hidden()).toBe(true);
    });

    it('stays visible while focus is inside the bar', async () => {
      renderAt('/novels/summer/3');
      await screen.findAllByRole('img', { name: /Chương 3, trang/ });
      const next = within(bar()).getByRole('link', { name: 'Chương sau' });

      scrollTo(500);
      expect(hidden()).toBe(true);
      // Tab to it like a keyboard user (a mouse click does not pin the bar).
      const user = userEvent.setup();
      for (let i = 0; i < 12 && document.activeElement !== next; i++) await user.tab();
      expect(next).toHaveFocus();
      expect(hidden()).toBe(false);
      scrollTo(800);
      expect(hidden()).toBe(false);
      act(() => next.blur());
      expect(hidden()).toBe(true);
    });

    it('does not slide with prefers-reduced-motion', () => {
      const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*?\.reader-bar[^{]*\{([^}]*)\}/.exec(css)?.[1] ?? '';
      expect(reduced).toMatch(/transition:\s*none/);
      expect(/\.reader-bar\s*\{[^}]*transition:/.test(css)).toBe(true);
    });
  });

  it('ends a chapter with Chương trước and Chương sau as two buttons of the same style', async () => {
    renderAt('/novels/summer/3');

    const end = await screen.findByRole('region', { name: 'Hết chương' });
    const prev = within(end).getByRole('link', { name: /Chương trước/ });
    const next = within(end).getByRole('link', { name: /Chương sau/ });
    expect(prev).toHaveAttribute('href', '/novels/summer/1');
    expect(next).toHaveAttribute('href', '/novels/summer/4');
    expect(prev.className).toBe(next.className);
    expect(prev).toHaveClass('button');
    expect(prev).not.toHaveClass('button--primary');
    expect(next).not.toHaveTextContent('Special'); // no big next-chapter card
    expect(end.querySelector('.reader__next-card')).toBeNull();
    // prev left, next right
    expect(prev.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves the empty slot when a neighbour is missing', async () => {
    renderAt('/novels/summer/1');

    const end = await screen.findByRole('region', { name: 'Hết chương' });
    expect(within(end).queryByRole('link', { name: /Chương trước/ })).not.toBeInTheDocument();
    expect(within(end).getByRole('link', { name: /Chương sau/ })).toBeInTheDocument();
    expect(end.querySelectorAll('.reader__end-nav > *')).toHaveLength(2);
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

    expect(await screen.findByRole('link', { name: 'Về trang truyện' })).toHaveAttribute('href', '/novels/summer');
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
    expect(reader(container)).toHaveAttribute('data-width', '600');
    await openSettings(user);
    expect(screen.getByRole('button', { name: 'Chế độ đêm' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Chế độ đêm' }));
    await user.click(screen.getByRole('button', { name: 'Chữ lớn hơn' }));
    expect(screen.getByRole('button', { name: 'Chế độ đêm' })).toHaveAttribute('aria-pressed', 'true');
    expect(reader(container)).toHaveAttribute('data-width', '760');
  });

  it('toggles night mode, flips aria-pressed and the reader class, and remembers it', async () => {
    const user = userEvent.setup();
    const { container, unmount } = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    await openSettings(user);
    const toggle = screen.getByRole('button', { name: 'Chế độ đêm' });

    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(reader(container)).not.toHaveClass('reader--night');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(reader(container)).toHaveClass('reader--night');
    expect(localStorage.getItem('reader-night')).toBe('on');

    unmount();
    const again = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    expect(reader(again.container)).toHaveClass('reader--night');
    await openSettings(user);
    expect(screen.getByRole('button', { name: 'Chế độ đêm' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Chế độ đêm' }));
    expect(localStorage.getItem('reader-night')).toBe('off');
    expect(reader(again.container)).not.toHaveClass('reader--night');
  });

  it('defaults to night mode when the theme is dark, and a stored choice overrides it', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const dark = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    expect(reader(dark.container)).toHaveClass('reader--night');
    dark.unmount();

    localStorage.setItem('reader-night', 'off');
    const overridden = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    expect(reader(overridden.container)).not.toHaveClass('reader--night');
  });

  it('follows the OS dark setting when no theme is forced', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { container } = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });

    expect(reader(container)).toHaveClass('reader--night');
  });

  it('keeps the night filter when the window is inactive', async () => {
    localStorage.setItem('reader-night', 'on');
    const { container } = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });

    fireEvent(window, new Event('blur'));

    expect(reader(container)).toHaveClass('reader--night');
    expect(reader(container)).toHaveClass('reader--hidden');
  });

  it('steps the width 600 / 760 / 900, disables the buttons at the ends and remembers it', async () => {
    const user = userEvent.setup();
    const { container, unmount } = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    await openSettings(user);
    const smaller = screen.getByRole('button', { name: 'Chữ nhỏ hơn' });
    const larger = screen.getByRole('button', { name: 'Chữ lớn hơn' });

    expect(reader(container)).toHaveAttribute('data-width', '600');
    expect(smaller).toBeDisabled();
    expect(larger).toBeEnabled();

    await user.click(larger);
    expect(reader(container)).toHaveAttribute('data-width', '760');
    expect(smaller).toBeEnabled();
    await user.click(larger);
    expect(reader(container)).toHaveAttribute('data-width', '900');
    expect(larger).toBeDisabled();
    expect(localStorage.getItem('reader-width')).toBe('900');

    await user.click(smaller);
    expect(reader(container)).toHaveAttribute('data-width', '760');

    unmount();
    const again = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    expect(reader(again.container)).toHaveAttribute('data-width', '760');
  });

  it('keeps the preference buttons outside the copy-guarded reader', async () => {
    const { container } = renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    await openSettings();

    expect(reader(container).contains(screen.getByRole('button', { name: 'Chế độ đêm' }))).toBe(false);
    expect(reader(container).contains(screen.getByRole('button', { name: 'Chữ lớn hơn' }))).toBe(false);
  });
});
