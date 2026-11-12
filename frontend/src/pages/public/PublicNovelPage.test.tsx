import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NovelSource } from '../../data/novelSource';
import type { PublicNovelDetail, PublicNovelSummary } from '../../data/novelTypes';
import PublicNovelPage from './PublicNovelPage';
import PublicNovelsPage from './PublicNovelsPage';
import { css } from '../../test/css';


const SUMMARY: PublicNovelSummary = {
  slug: 'summer',
  title: 'Tình Yêu Mùa Hạ',
  coverUrl: '/media/c.png',
  originalAuthor: 'ผู้เขียน',
  tags: ['romance', 'BL'],
  novelStatus: 'ONGOING',
  publishedCount: 2,
  totalChapters: 5,
  lastPublishedAt: '2026-11-05T10:00:00Z',
  updatedAt: '2026-11-05T10:00:00Z',
};

const DETAIL: PublicNovelDetail = {
  slug: 'summer',
  title: 'Tình Yêu Mùa Hạ',
  coverUrl: '/media/c.png',
  originalAuthor: 'ผู้เขียน',
  description: 'Một mùa hè đáng nhớ.',
  tags: ['romance', 'BL'],
  novelStatus: 'COMPLETED',
  translatorCredit: 'Dịch: @byZenQN',
  sourceUrl: 'https://example.com/book',
  trailerVideoId: null,
  chapters: [
    { chapterNo: 1, title: 'Mở đầu' },
    { chapterNo: 3, title: null, label: 'Ngoại truyện 1' },
  ],
};

function source(over: Partial<NovelSource> = {}): NovelSource {
  return {
    listNovels: async () => [SUMMARY],
    getNovel: async () => DETAIL,
    getChapter: async () => {
      throw new Error('not used');
    },
    ...over,
  };
}

describe('PublicNovelsPage', () => {
  it('has Vietnamese headings, an empty state and a tab title', async () => {
    document.title = 'before';
    const { unmount } = render(
      <MemoryRouter>
        <PublicNovelsPage source={source({ listNovels: async () => [] })} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Truyện' })).toBeInTheDocument();
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    expect(await screen.findByText('Chưa có truyện nào. Quay lại sau nhé.')).toBeInTheDocument();
    expect(document.title).toBe('Truyện');
    unmount();
    expect(document.title).toBe('before');
  });

  it('shows the status in Vietnamese', async () => {
    render(
      <MemoryRouter>
        <PublicNovelsPage source={source()} />
      </MemoryRouter>,
    );

    expect((await screen.findAllByText('Đang ra')).length).toBeGreaterThan(0);
  });

  it('shows a small card per novel with x/y chương', async () => {
    render(
      <MemoryRouter>
        <PublicNovelsPage source={source()} />
      </MemoryRouter>,
    );

    const section = await screen.findByRole('region', { name: 'Mới cập nhật' });
    const card = within(section).getByRole('link', { name: /Tình Yêu Mùa Hạ/ });
    expect(card).toHaveAttribute('href', '/novels/summer');
    expect(within(card).getByText(/^2\/5 chương · /)).toBeInTheDocument();
  });
});

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

describe('PublicNovelPage', () => {
  function renderPage(s = source(), path = '/novels/summer') {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/novels/:slug" element={<PublicNovelPage source={s} />} />
        </Routes>
        <Where />
      </MemoryRouter>,
    );
  }

  const noDescription = () => source({ getNovel: async () => ({ ...DETAIL, description: null }) });
  const MANY: PublicNovelDetail = {
    ...DETAIL,
    chapters: Array.from({ length: 13 }, (_, i) => ({ chapterNo: i + 1, title: `C${i + 1}` })),
  };

  it('shows the novel details and its published chapters', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' })).toBeInTheDocument();
    expect(screen.getByText('ผู้เขียน')).toBeInTheDocument();
    expect(screen.getByText('Hoàn thành')).toBeInTheDocument();
    expect(screen.getByText('BL')).toBeInTheDocument();
    expect(screen.getByText('Dịch: @byZenQN')).toBeInTheDocument();
    const original = screen.getByRole('link', { name: 'Truyện gốc' });
    expect(original).toHaveAttribute('href', 'https://example.com/book');
    expect(original).toHaveAttribute('rel', 'noopener noreferrer');
    const chapters = within(screen.getByRole('list', { name: 'Danh sách chương' })).getAllByRole('link');
    expect(chapters.map((a) => a.textContent)).toEqual(['Chương 1: Mở đầu', 'Ngoại truyện 1']);
    expect(chapters[1]).toHaveAttribute('href', '/novels/summer/3');
    expect(screen.getAllByRole('link', { name: 'Bắt đầu đọc' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /tủ sách/ })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Bắt đầu đọc' })).toHaveAttribute('href', '/novels/summer/1');
  });

  it('uses Vietnamese labels and the novel title as the tab title', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
    expect(screen.getByText('Tác giả')).toBeInTheDocument();
    expect(screen.getByText('Trạng thái')).toBeInTheDocument();
    expect(screen.getByText('Bản dịch')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Thể loại' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Giới thiệu' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Danh sách chương' })).toBeInTheDocument();
    expect(document.title).toBe('Tình Yêu Mùa Hạ');
  });

  it('has two tabs when there is a description: Giới thiệu first, Danh sách chương selected by default', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Giới thiệu', 'Danh sách chương']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('list', { name: 'Danh sách chương' })).toBeInTheDocument();
    expect(screen.queryByText('Một mùa hè đáng nhớ.')).not.toBeInTheDocument();
  });

  it('opens the description with ?tab=intro and keeps the line breaks', async () => {
    const s = source({ getNovel: async () => ({ ...DETAIL, description: 'Dòng 1\nDòng 2' }) });
    renderPage(s, '/novels/summer?tab=intro');

    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
    expect(screen.getByRole('tab', { name: 'Giới thiệu' })).toHaveAttribute('aria-selected', 'true');
    const text = screen.getByText(/Dòng 1/);
    expect(text.textContent).toBe('Dòng 1\nDòng 2');
    expect(text).toHaveClass('novel-description');
    expect(/\.novel-description\s*\{[^}]*white-space:\s*pre-line/.test(css)).toBe(true);
    expect(screen.queryByRole('list', { name: 'Danh sách chương' })).not.toBeInTheDocument();
  });

  it('keeps the selected tab in the URL: ?tab=intro for Giới thiệu, no parameter for the chapter list', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/novels\/summer$/);

    await user.click(screen.getByRole('tab', { name: 'Giới thiệu' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/novels/summer?tab=intro');
    expect(screen.getByText('Một mùa hè đáng nhớ.')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Danh sách chương' }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/novels\/summer$/);
    expect(screen.getByRole('list', { name: 'Danh sách chương' })).toBeInTheDocument();
  });

  it('falls back to the chapter list for an unknown tab value', async () => {
    renderPage(source(), '/novels/summer?tab=whatever');

    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
    expect(screen.getByRole('tab', { name: 'Danh sách chương' })).toHaveAttribute('aria-selected', 'true');
  });

  it('has no tabs without a description, just the chapter list under its heading', async () => {
    renderPage(noDescription(), '/novels/summer?tab=intro');

    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Danh sách chương' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Danh sách chương' })).toBeInTheDocument();
  });

  it('shows the chapters in one bordered box of compact rows', async () => {
    renderPage();

    const list = await screen.findByRole('list', { name: 'Danh sách chương' });
    expect(list).toHaveClass('chapter-list', 'chapter-list--public');
    expect(list).not.toHaveClass('chapter-list--columns');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    const box = /\.chapter-list--public\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(box).toMatch(/border:\s*1px solid var\(--rule\)/);
    expect(box).toMatch(/border-radius:/);
    expect(box).toMatch(/gap:\s*0/);
    expect(/\.chapter-list--public \.chapter-list__open\s*\{[^}]*min-height:\s*40px/.test(css)).toBe(true);
  });

  it('uses two columns on wide screens only for more than 12 chapters, reading down the first column first', async () => {
    renderPage(source({ getNovel: async () => MANY }));

    const list = await screen.findByRole('list', { name: 'Danh sách chương' });
    expect(list).toHaveClass('chapter-list--columns');
    // DOM order stays ascending; CSS columns fill the first column top to bottom, then the second.
    expect(within(list).getAllByRole('link').map((a) => a.textContent)).toEqual(
      MANY.chapters.map((c) => `Chương ${c.chapterNo}: C${c.chapterNo}`),
    );
    expect(css).toMatch(/@media \(min-width: 760px\)\s*\{\s*\.chapter-list--columns\s*\{[^}]*column-count:\s*2/);
  });

  it('keeps one column for exactly 12 chapters', async () => {
    renderPage(source({ getNovel: async () => ({ ...MANY, chapters: MANY.chapters.slice(0, 12) }) }));

    expect(await screen.findByRole('list', { name: 'Danh sách chương' })).not.toHaveClass('chapter-list--columns');
  });

  it('shows Novels > novel title as a breadcrumb', async () => {
    renderPage();

    await screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Novels' })).toHaveAttribute('href', '/novels');
    const last = within(crumbs).getByText('Tình Yêu Mùa Hạ');
    expect(last).toHaveAttribute('aria-current', 'page');
    expect(last.closest('a')).toBeNull();
  });

  it('says it is loading', () => {
    renderPage(source({ getNovel: () => new Promise(() => {}) }));

    expect(screen.getByText('Đang tải truyện…')).toBeInTheDocument();
  });

  it('says when the novel does not exist', async () => {
    const { ApiError } = await import('../../api/client');
    renderPage(
      source({
        getNovel: async () => {
          throw new ApiError(404, 'NOVEL_NOT_FOUND', 'x');
        },
      }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Không tải được. Vui lòng thử lại sau.');
    expect(within(alert).getByRole('link', { name: 'Về danh sách truyện' })).toHaveAttribute('href', '/novels');
  });
});

describe('PublicNovelPage from Wattpad', () => {
  it('shows the author and the original link like any other novel', async () => {
    const s = source({
      getNovel: async () => ({
        ...DETAIL,
        originalAuthor: 'emibonnie',
        sourceUrl: 'https://www.wattpad.com/story/396487502',
      }),
    });
    render(
      <MemoryRouter initialEntries={['/novels/summer']}>
        <Routes>
          <Route path="/novels/:slug" element={<PublicNovelPage source={s} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('emibonnie')).toBeInTheDocument();
    const original = screen.getByRole('link', { name: 'Truyện gốc' });
    expect(original).toHaveAttribute('href', 'https://www.wattpad.com/story/396487502');
    expect(original).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('PublicNovelPage reading progress', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function renderPage(s = source()) {
    render(
      <MemoryRouter initialEntries={['/novels/summer']}>
        <Routes>
          <Route path="/novels/:slug" element={<PublicNovelPage source={s} />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('offers to continue from the stored chapter, or to start over', async () => {
    localStorage.setItem('novel-progress:summer', JSON.stringify({ chapterNo: 3 }));
    renderPage();

    const resume = await screen.findByRole('link', { name: 'Đọc tiếp: Ngoại truyện 1' });
    expect(resume).toHaveAttribute('href', '/novels/summer/3');
    expect(screen.getByRole('link', { name: 'Đọc từ đầu' })).toHaveAttribute('href', '/novels/summer/1');
    expect(screen.queryByRole('link', { name: 'Bắt đầu đọc' })).not.toBeInTheDocument();
  });

  it('says Bắt đầu đọc without stored progress', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: 'Bắt đầu đọc' })).toHaveAttribute('href', '/novels/summer/1');
    expect(screen.queryByRole('link', { name: /Đọc tiếp/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Đọc từ đầu' })).not.toBeInTheDocument();
  });

  it('says Bắt đầu đọc, with no broken link, when the stored chapter is no longer published', async () => {
    localStorage.setItem('novel-progress:summer', JSON.stringify({ chapterNo: 99 }));
    renderPage();

    expect(await screen.findByRole('link', { name: 'Bắt đầu đọc' })).toHaveAttribute('href', '/novels/summer/1');
    expect(screen.queryByRole('link', { name: /Đọc tiếp/ })).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/novels/summer/99"]')).toBeNull();
    expect(screen.queryByText('Đang đọc')).not.toBeInTheDocument();
  });

  it('marks read chapters and the one being read', async () => {
    localStorage.setItem('novel-progress:summer', JSON.stringify({ chapterNo: 3 }));
    localStorage.setItem('novel-read:summer', JSON.stringify([1, 3]));
    renderPage();

    const items = within(await screen.findByRole('list', { name: 'Danh sách chương' })).getAllByRole('listitem');
    expect(within(items[0]).getByRole('img', { name: 'Đã đọc' })).toBeInTheDocument();
    expect(items[0]).toHaveClass('chapter-list__item--read');
    expect(within(items[0]).queryByText('Đang đọc')).not.toBeInTheDocument();
    expect(within(items[1]).getByText('Đang đọc')).toBeInTheDocument();
    expect(within(items[1]).getByRole('img', { name: 'Đã đọc' })).toBeInTheDocument();
  });

  it('leaves unread chapters unmarked', async () => {
    renderPage();

    const items = within(await screen.findByRole('list', { name: 'Danh sách chương' })).getAllByRole('listitem');
    expect(within(items[0]).queryByRole('img', { name: 'Đã đọc' })).not.toBeInTheDocument();
    expect(items[0]).not.toHaveClass('chapter-list__item--read');
  });

  it('still renders with the defaults when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderPage();

    expect(await screen.findByRole('link', { name: 'Bắt đầu đọc' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Danh sách chương' })).getAllByRole('link')).toHaveLength(2);
  });
});

describe('PublicNovelPage trailer tab', () => {
  const ID = 'dQw4w9WgXcQ';

  function renderPage(over: Partial<PublicNovelDetail>, path = '/novels/summer') {
    const s = source({ getNovel: async () => ({ ...DETAIL, ...over }) });
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/novels/:slug" element={<PublicNovelPage source={s} />} />
        </Routes>
        <Where />
      </MemoryRouter>,
    );
  }

  const tabNames = () => within(screen.getByRole('tablist')).getAllByRole('tab').map((t) => t.textContent);
  const selected = () => screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;
  const ready = () => screen.findByRole('heading', { name: 'Tình Yêu Mùa Hạ' });

  it.each([
    ['description and trailer', 'Mô tả', ID, ['Giới thiệu', 'Danh sách chương', 'Trailer']],
    ['a description only', 'Mô tả', null, ['Giới thiệu', 'Danh sách chương']],
    ['a trailer only', null, ID, ['Danh sách chương', 'Trailer']],
  ])('lists the tabs in order for %s', async (_name, description, trailerVideoId, expected) => {
    renderPage({ description, trailerVideoId });
    await ready();

    expect(tabNames()).toEqual(expected);
    expect(selected()).toBe('Danh sách chương');
  });

  it('has no tablist with neither a description nor a trailer', async () => {
    renderPage({ description: null, trailerVideoId: null });
    await ready();

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Danh sách chương' })).toBeInTheDocument();
  });

  it('treats published data from before trailers existed as having none', async () => {
    const old: Partial<PublicNovelDetail> = { ...DETAIL };
    delete old.trailerVideoId;
    const s = source({ getNovel: async () => old as PublicNovelDetail });
    render(
      <MemoryRouter initialEntries={['/novels/summer?tab=trailer']}>
        <Routes>
          <Route path="/novels/:slug" element={<PublicNovelPage source={s} />} />
        </Routes>
      </MemoryRouter>,
    );
    await ready();

    expect(tabNames()).toEqual(['Giới thiệu', 'Danh sách chương']);
    expect(selected()).toBe('Danh sách chương');
  });

  it('opens the Trailer tab with ?tab=trailer', async () => {
    renderPage({ trailerVideoId: ID }, '/novels/summer?tab=trailer');
    await ready();

    expect(selected()).toBe('Trailer');
    expect(screen.queryByRole('list', { name: 'Danh sách chương' })).not.toBeInTheDocument();
  });

  it('falls back to the chapter list for ?tab=trailer when there is no trailer', async () => {
    renderPage({ trailerVideoId: null }, '/novels/summer?tab=trailer');
    await ready();

    expect(selected()).toBe('Danh sách chương');
    expect(screen.queryByTitle(/Trailer/)).not.toBeInTheDocument();
  });

  it('falls back to the chapter list for ?tab=intro when there is no description', async () => {
    renderPage({ description: null, trailerVideoId: ID }, '/novels/summer?tab=intro');
    await ready();

    expect(selected()).toBe('Danh sách chương');
  });

  it('names only the non-default tab in the URL', async () => {
    const user = userEvent.setup();
    renderPage({ trailerVideoId: ID });
    await ready();

    await user.click(screen.getByRole('tab', { name: 'Trailer' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/novels/summer?tab=trailer');
    await user.click(screen.getByRole('tab', { name: 'Giới thiệu' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/novels/summer?tab=intro');
    await user.click(screen.getByRole('tab', { name: 'Danh sách chương' }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/novels\/summer$/);
  });

  describe('embed', () => {
    it('loads no iframe while another tab is open', async () => {
      renderPage({ trailerVideoId: ID });
      await ready();

      expect(document.querySelector('iframe')).toBeNull();
    });

    it('creates the iframe only while the Trailer tab is open, and removes it when leaving', async () => {
      const user = userEvent.setup();
      renderPage({ trailerVideoId: ID });
      await ready();

      await user.click(screen.getByRole('tab', { name: 'Trailer' }));
      expect(document.querySelectorAll('iframe')).toHaveLength(1);

      await user.click(screen.getByRole('tab', { name: 'Danh sách chương' }));
      expect(document.querySelector('iframe')).toBeNull();
    });

    it('embeds the nocookie player with a title and the required attributes', async () => {
      renderPage({ trailerVideoId: ID }, '/novels/summer?tab=trailer');
      await ready();

      const frame = screen.getByTitle('Trailer: Tình Yêu Mùa Hạ');
      expect(frame.tagName).toBe('IFRAME');
      expect(frame).toHaveAttribute('src', `https://www.youtube-nocookie.com/embed/${ID}`);
      expect(frame).toHaveAttribute('allow', 'accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen');
      expect(frame).toHaveAttribute('allowfullscreen');
      expect(frame).toHaveAttribute('loading', 'lazy');
      expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      expect(frame).not.toHaveAttribute('autoplay');
      expect(frame.getAttribute('src')).not.toMatch(/autoplay/);
    });

    it('never frames a value that is not an 11-character video id', async () => {
      renderPage({ trailerVideoId: 'javascript:alert(1)' }, '/novels/summer?tab=trailer');
      await ready();

      expect(document.querySelector('iframe')).toBeNull();
      expect(screen.queryByRole('tab', { name: 'Trailer' })).not.toBeInTheDocument();
    });

    it('is a responsive 16:9 frame with the frame radius and no shadow', () => {
      const rule = css.match(/\.novel-trailer\s*\{[^}]*\}/)?.[0] ?? '';

      expect(rule).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
      expect(rule).toMatch(/width:\s*100%/);
      expect(rule).toMatch(/border-radius:\s*var\(--radius-frame\)/);
      expect(rule).not.toMatch(/shadow/);
    });
  });
});

describe('PublicNovelPage shelf button', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/novels/summer']}>
        <Routes>
          <Route path="/novels/:slug" element={<PublicNovelPage source={source()} />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('shelf button toggles aria-pressed and persists across remount', async () => {
    const user = userEvent.setup();
    const first = renderPage();
    const add = await screen.findByRole('button', { name: 'Thêm vào tủ sách' });
    expect(add).toHaveAttribute('aria-pressed', 'false');
    await user.click(add);
    expect(screen.getByRole('button', { name: 'Đã lưu vào tủ sách' })).toHaveAttribute('aria-pressed', 'true');
    expect(JSON.parse(localStorage.getItem('novel-shelf')!)).toEqual(['summer']);
    first.unmount();

    renderPage();
    const saved = await screen.findByRole('button', { name: 'Đã lưu vào tủ sách' });
    expect(saved).toHaveAttribute('aria-pressed', 'true');
    await user.click(saved);
    expect(screen.getByRole('button', { name: 'Thêm vào tủ sách' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('shelf button works with blocked storage', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Thêm vào tủ sách' }));
    expect(screen.getByRole('button', { name: 'Đã lưu vào tủ sách' })).toHaveAttribute('aria-pressed', 'true');
  });
});
