import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NovelSource } from '../../data/novelSource';
import type { PublicNovelDetail, PublicNovelSummary } from '../../data/novelTypes';
import { expectTooltip } from '../../test/tooltip';
import FeaturedNovels from './FeaturedNovels';
import { css } from '../../test/css';


function summary(slug: string, over: Partial<PublicNovelSummary> = {}): PublicNovelSummary {
  return {
    slug,
    title: `Truyện ${slug}`,
    coverUrl: `/media/${slug}.png`,
    originalAuthor: null,
    tags: [],
    novelStatus: 'ONGOING',
    publishedCount: 2,
    totalChapters: 5,
    lastPublishedAt: '2026-11-05T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
    ...over,
  };
}

function detail(slug: string, first = 1): PublicNovelDetail {
  return {
    slug,
    title: `Truyện ${slug}`,
    coverUrl: null,
    originalAuthor: null,
    description: null,
    tags: [],
    novelStatus: 'ONGOING',
    translatorCredit: null,
    sourceUrl: null,
    chapters: [
      { chapterNo: first, title: 'Mở đầu' },
      { chapterNo: first + 2, title: 'Mưa' },
      { chapterNo: first + 3, title: null, label: 'Special' },
    ],
  };
}

const source: NovelSource = {
  listNovels: async () => [],
  getNovel: async (slug) => detail(slug),
  getChapter: async () => {
    throw new Error('not used');
  },
};

const NOVELS = [
  summary('a', { originalAuthor: 'ผู้เขียน' }),
  summary('b', { novelStatus: 'COMPLETED', publishedCount: 7, totalChapters: 7, lastPublishedAt: '2026-10-20T22:30:00Z' }),
  summary('c', { coverUrl: null }),
];

async function renderBanner(novels = NOVELS, s = source) {
  const view = render(
    <MemoryRouter>
      <FeaturedNovels novels={novels} source={s} />
    </MemoryRouter>,
  );
  await act(async () => {}); // the chapter lists load
  return view;
}

const counter = () => screen.getByText(/^\d\d \/ \d\d$/).textContent;

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('FeaturedNovels', () => {
  it('shows the first novel: status, title, facts and the start button', async () => {
    await renderBanner();

    const banner = screen.getByRole('region', { name: 'Truyện nổi bật' });
    expect(within(banner).getByText('Đang ra')).toBeInTheDocument();
    expect(within(banner).getByRole('heading', { name: 'Truyện a' })).toBeInTheDocument();
    const facts = within(banner).getByRole('list', { name: 'Thông tin' });
    expect(facts).toHaveTextContent('Chương2/5');
    expect(facts).toHaveTextContent('Tác giảผู้เขียน');
    expect(facts).toHaveTextContent('Cập nhật05/11/2026');
    expect(within(banner).getByRole('link', { name: 'Đọc từ đầu' })).toHaveAttribute('href', '/novels/a/1');
  });

  it('shows the update date in Vietnam time, as dd/MM/yyyy', async () => {
    // 22:30 UTC on 20 Oct is already 21 Oct in Vietnam.
    await renderBanner([NOVELS[1]]);

    expect(screen.getByRole('list', { name: 'Thông tin' })).toHaveTextContent('Cập nhật21/10/2026');
    expect(screen.getByText('Hoàn thành')).toBeInTheDocument();
  });

  it('leaves out the author when there is none, and falls back to updatedAt without a publish date', async () => {
    await renderBanner([summary('x', { lastPublishedAt: null, updatedAt: '2026-09-03T05:00:00Z' })]);

    const facts = screen.getByRole('list', { name: 'Thông tin' });
    expect(facts).not.toHaveTextContent('Tác giả');
    expect(facts).toHaveTextContent('Cập nhật03/09/2026');
  });

  it('offers Đọc tiếp with the stored chapter, else Đọc từ đầu', async () => {
    localStorage.setItem('novel-progress:a', JSON.stringify({ chapterNo: 3 }));
    await renderBanner();

    const resume = screen.getByRole('link', { name: 'Đọc tiếp: Chương 3' });
    expect(resume).toHaveAttribute('href', '/novels/a/3');
    expect(screen.queryByRole('link', { name: 'Đọc từ đầu' })).not.toBeInTheDocument();
  });

  it('starts over when the stored chapter is not published any more', async () => {
    localStorage.setItem('novel-progress:a', JSON.stringify({ chapterNo: 99 }));
    await renderBanner();

    expect(screen.getByRole('link', { name: 'Đọc từ đầu' })).toHaveAttribute('href', '/novels/a/1');
  });

  it('links to the novel page until the chapters have loaded, and survives a failed load', async () => {
    await renderBanner(NOVELS, { ...source, getNovel: () => Promise.reject(new Error('x')) });

    expect(screen.getByRole('link', { name: 'Đọc từ đầu' })).toHaveAttribute('href', '/novels/a');
  });

  it('has an info button linking to the novel page, with a tooltip', async () => {
    await renderBanner();

    const info = screen.getByRole('link', { name: 'Thông tin truyện' });
    expect(info).toHaveAttribute('href', '/novels/a');
    expect(info.querySelector('svg')).not.toBeNull();
    await expectTooltip(info, 'Thông tin truyện');
  });

  it('fans the covers as links to their own novel pages, named by the title', async () => {
    await renderBanner();

    expect(counter()).toBe('01 / 03');
    const banner = screen.getByRole('region', { name: 'Truyện nổi bật' });
    const covers = ['a', 'b', 'c'].map((slug) => within(banner).getByRole('link', { name: `Truyện ${slug}` }));
    covers.forEach((c, i) => expect(c).toHaveAttribute('href', `/novels/${['a', 'b', 'c'][i]}`));
    expect(covers[0]).toHaveAttribute('aria-current', 'true');
    expect(covers[0].style.getPropertyValue('--o')).toBe('0');
    expect(covers[1].style.getPropertyValue('--o')).toBe('1');
    expect(covers[2].style.getPropertyValue('--o')).toBe('-1');
    // Clicking a cover leaves the banner for that novel's page: the current novel does not change here.
    expect(screen.queryByRole('button', { name: /^Xem: / })).not.toBeInTheDocument();
  });

  it('browses with the small previous and next buttons, which have tooltips and wrap around', async () => {
    const user = userEvent.setup();
    await renderBanner();
    const prev = screen.getByRole('button', { name: 'Truyện trước' });
    const next = screen.getByRole('button', { name: 'Truyện sau' });
    for (const el of [prev, next]) expect(el.querySelector('svg')).not.toBeNull();
    await expectTooltip(prev, 'Truyện trước');
    await expectTooltip(next, 'Truyện sau');

    await user.click(next);
    expect(counter()).toBe('02 / 03');
    expect(screen.getByRole('heading', { name: 'Truyện b' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đọc từ đầu' })).toHaveAttribute('href', '/novels/b/1');
    await user.click(prev);
    await user.click(prev);
    expect(counter()).toBe('03 / 03');
    await user.click(next);
    expect(counter()).toBe('01 / 03');
  });

  it('has no previous/next buttons, counter or pause for a single novel', async () => {
    await renderBanner([NOVELS[0]]);

    expect(screen.queryByText(/^\d\d \/ \d\d$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tạm dừng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Truyện trước' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Truyện sau' })).not.toBeInTheDocument();
  });

  it('uses the empty-cover placeholder for a novel without a cover', async () => {
    await renderBanner();

    const placeholder = screen.getByRole('link', { name: 'Truyện c' }).querySelector('.novel-card__cover--empty');
    expect(placeholder).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Truyện a' }).querySelector('img')).toHaveAttribute('src', '/media/a.png');
  });

  it('puts the current cover blurred behind the banner', async () => {
    const { container } = await renderBanner();

    expect(container.querySelector('.featured__bg')).toBeInTheDocument();
    expect((container.querySelector('.featured') as HTMLElement).style.getPropertyValue('--cover')).toContain('/media/a.png');
    expect(css).toMatch(/\.featured__bg\s*\{[^}]*var\(--cover[^}]*filter:\s*blur[^}]*opacity:\s*0?\.\d+/);
  });

  describe('auto-advance', () => {
    beforeEach(() => vi.useFakeTimers());

    const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

    it('moves to the next novel every 6 seconds and wraps around', async () => {
      await renderBanner();

      await tick(5999);
      expect(counter()).toBe('01 / 03');
      await tick(1);
      expect(counter()).toBe('02 / 03');
      await tick(6000);
      await tick(6000);
      expect(counter()).toBe('01 / 03');
    });

    it('waits while the pointer is over the banner or focus is inside it', async () => {
      await renderBanner();
      const banner = screen.getByRole('region', { name: 'Truyện nổi bật' });

      fireEvent.mouseEnter(banner);
      await tick(12000);
      expect(counter()).toBe('01 / 03');
      fireEvent.mouseLeave(banner);
      await tick(6000);
      expect(counter()).toBe('02 / 03');

      act(() => screen.getByRole('link', { name: 'Thông tin truyện' }).focus());
      await tick(12000);
      expect(counter()).toBe('02 / 03');
      act(() => screen.getByRole('link', { name: 'Thông tin truyện' }).blur());
      await tick(6000);
      expect(counter()).toBe('03 / 03');
    });

    it('can be paused with the pause button (the carousel owns the control)', async () => {
      await renderBanner();

      fireEvent.click(screen.getByRole('button', { name: 'Tạm dừng' }));
      await tick(20000);

      expect(counter()).toBe('01 / 03');
    });

    it('does not advance with prefers-reduced-motion', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }));
      await renderBanner();

      await tick(30000);
      expect(counter()).toBe('01 / 03');
      expect(vi.getTimerCount()).toBe(0);
    });

  });
});
