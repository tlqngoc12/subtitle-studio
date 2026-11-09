import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import type { NovelSource } from '../../data/novelSource';
import type { PublicChapterFile, PublicNovelDetail } from '../../data/novelTypes';
import ReaderPage from './ReaderPage';

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

afterEach(() => {
  document.title = '';
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

  it('shows the chapter name once: the heading is visually hidden, the select shows it', async () => {
    renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });

    const heading = screen.getByRole('heading', { name: 'Chương 3: Mưa' });
    expect(heading).toHaveClass('visually-hidden');
    const select = screen.getByLabelText('Danh sách chương');
    expect(select).toHaveValue('3');
    expect(within(select).getByRole('option', { name: 'Chương 3: Mưa' })).toBeInTheDocument();
    const visible = screen
      .queryAllByText('Chương 3: Mưa')
      .filter((el) => el !== heading && el.tagName !== 'OPTION' && !el.closest('.visually-hidden'));
    expect(visible).toHaveLength(0);
    expect(screen.queryByText('Chapter')).not.toBeInTheDocument();
  });

  it('names a labelled chapter by its label', async () => {
    renderAt('/novels/summer/4');

    expect(await screen.findByRole('heading', { name: 'Special' })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /^Special, trang/ })).toHaveLength(3);
  });

  it('has a toolbar with links to the previous and next chapters', async () => {
    renderAt('/novels/summer/3');

    const toolbar = await screen.findByRole('navigation', { name: 'Chuyển chương' });
    expect(within(toolbar).getByRole('link', { name: /Chương trước/ })).toHaveAttribute('href', '/novels/summer/1');
    expect(within(toolbar).getByRole('link', { name: /Chương sau/ })).toHaveAttribute('href', '/novels/summer/4');
    expect(within(toolbar).getByLabelText('Danh sách chương')).toBeInTheDocument();
  });

  it('has no previous link on the first chapter', async () => {
    renderAt('/novels/summer/1');

    await screen.findAllByRole('img', { name: /Chương 1, trang/ });
    expect(screen.queryByRole('link', { name: /Chương trước/ })).not.toBeInTheDocument();
  });

  it('ends a chapter with a card naming the next chapter', async () => {
    renderAt('/novels/summer/3');

    const end = await screen.findByRole('region', { name: 'Hết chương' });
    const next = within(end).getByRole('link', { name: /Chương sau/ });
    expect(next).toHaveAttribute('href', '/novels/summer/4');
    expect(next).toHaveTextContent('Special');
    expect(within(end).getByRole('link', { name: /Chương trước/ })).toHaveAttribute('href', '/novels/summer/1');
  });

  it('ends the last chapter with a "read everything" box', async () => {
    renderAt('/novels/summer/4');

    const end = await screen.findByRole('region', { name: 'Hết chương' });
    expect(within(end).getByText('Bạn đã đọc hết các chương đã đăng.')).toBeInTheDocument();
    expect(within(end).getByRole('link', { name: 'Về trang truyện' })).toHaveAttribute('href', '/novels/summer');
    expect(within(end).queryByRole('link', { name: /Chương sau/ })).not.toBeInTheDocument();
  });

  it('jumps to another chapter from the list', async () => {
    renderAt('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });

    await userEvent.setup().selectOptions(screen.getByLabelText('Danh sách chương'), '4');

    expect(await screen.findAllByRole('img', { name: /^Special, trang/ })).toHaveLength(3);
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

  it('does not navigate twice when an arrow is used inside the chapter select', async () => {
    const user = userEvent.setup();
    renderAt('/novels/summer/1');
    await screen.findAllByRole('img', { name: /Chương 1, trang/ });
    const select = screen.getByLabelText('Danh sách chương');

    // A key pressed inside the select bubbles to the page: the page handler must leave it to the select.
    select.focus();
    await user.keyboard('{ArrowRight}');
    fireEvent.keyDown(select, { key: 'ArrowRight' });
    expect(screen.getAllByRole('img', { name: /Chương 1, trang/ })).toHaveLength(3);

    // The select's own change (what a real arrow press does in a browser) navigates exactly once.
    await user.selectOptions(select, '3');
    expect(await screen.findAllByRole('img', { name: /Chương 3, trang/ })).toHaveLength(3);
    expect(screen.queryByRole('img', { name: /^Special, trang/ })).not.toBeInTheDocument();
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

  it('falls back to a plain back link before the novel is loaded', async () => {
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
