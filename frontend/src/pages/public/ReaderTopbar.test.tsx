import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavBar } from '../../components/NavBar';
import { TopbarSlotProvider } from '../../components/TopbarSlot';
import { SiteProvider, type Site } from '../../data/SiteContext';
import type { NovelSource } from '../../data/novelSource';
import type { PublicChapterFile, PublicNovelDetail } from '../../data/novelTypes';
import ReaderPage from './ReaderPage';
import { css } from '../../test/css';


function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  fireEvent.scroll(window);
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
  chapters: [{ chapterNo: 3, title: 'Mưa' }],
};

const CHAPTER: PublicChapterFile = { chapterNo: 3, title: 'Mưa', label: null, prev: null, next: null, images: ['/a.webp'] };

const source: NovelSource = { listNovels: async () => [], getNovel: async () => NOVEL, getChapter: async () => CHAPTER };
const site = { source: {}, readOnly: true, homePath: '/vietsub/list' } as unknown as Site;

function renderApp(path: string) {
  return render(
    <SiteProvider value={site}>
      <MemoryRouter initialEntries={[path]}>
        <TopbarSlotProvider>
          <NavBar />
          <Routes>
            <Route path="/novels/all" element={<p>all novels</p>} />
            <Route path="/novels/:slug" element={<p>novel page</p>} />
            <Route path="/novels/:slug/:chapterNo" element={<ReaderPage source={source} />} />
          </Routes>
        </TopbarSlotProvider>
      </MemoryRouter>
    </SiteProvider>,
  );
}

const topbar = () => screen.getByRole('banner');
const reader = () => within(topbar()).getByRole('navigation', { name: 'Chuyển chương' });

beforeEach(() => {
  localStorage.clear();
  scrollTo(0);
});
afterEach(() => vi.restoreAllMocks());

describe('reader controls in the top bar', () => {
  it('replace the logo and the main menu on the chapter route only', async () => {
    renderApp('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });

    expect(within(topbar()).queryByRole('link', { name: 'Subtitle Studio' })).not.toBeInTheDocument();
    expect(within(topbar()).queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(within(reader()).getByRole('link', { name: 'Về trang truyện' })).toHaveAttribute('href', '/novels/summer');
    expect(reader()).toHaveTextContent('Tình Yêu Mùa Hạ');
    for (const name of ['Chương trước', 'Chương sau', 'Mục lục', 'Cài đặt']) {
      expect(within(reader()).getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('are not shown on the novel page or the all-novels page', () => {
    renderApp('/novels/all');
    expect(within(topbar()).getByRole('link', { name: 'Subtitle Studio' })).toBeInTheDocument();
    expect(within(topbar()).getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(within(topbar()).queryByRole('navigation', { name: 'Chuyển chương' })).not.toBeInTheDocument();
  });

  it('give the menu back when the reader is left', async () => {
    const user = userEvent.setup();
    renderApp('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    await user.click(within(reader()).getByRole('link', { name: 'Về trang truyện' }));

    expect(await screen.findByText('novel page')).toBeInTheDocument();
    expect(within(topbar()).getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(topbar()).not.toHaveClass('topbar--hidden');
  });

  it('settings popover shows the theme and size groups', async () => {
    const user = userEvent.setup();
    renderApp('/novels/summer/3');
    await screen.findAllByRole('img', { name: /Chương 3, trang/ });
    await user.click(within(reader()).getByRole('button', { name: 'Cài đặt' }));
    expect(screen.getByRole('radiogroup', { name: 'Màu nền' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Cỡ chữ' })).toBeInTheDocument();
  });

  describe('hiding the whole top bar on scroll', () => {
    const hidden = () => topbar().classList.contains('topbar--hidden');

    it('slides away scrolling down and returns scrolling up or near the top', async () => {
      renderApp('/novels/summer/3');
      await screen.findAllByRole('img', { name: /Chương 3, trang/ });
      expect(hidden()).toBe(false);

      scrollTo(40);
      expect(hidden()).toBe(false);
      scrollTo(400);
      expect(hidden()).toBe(true);
      scrollTo(300);
      expect(hidden()).toBe(false);
      scrollTo(700);
      expect(hidden()).toBe(true);
      scrollTo(20);
      expect(hidden()).toBe(false);
    });

    it('stays while a popover is open', async () => {
      const user = userEvent.setup();
      renderApp('/novels/summer/3');
      await screen.findAllByRole('img', { name: /Chương 3, trang/ });

      await user.click(within(reader()).getByRole('button', { name: 'Cài đặt' }));
      scrollTo(900);
      expect(hidden()).toBe(false);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'Màu nền' })).not.toBeInTheDocument());
      act(() => (document.activeElement as HTMLElement).blur());
      scrollTo(1000);
      expect(hidden()).toBe(true);
    });

    it('is not slid away on other routes', () => {
      renderApp('/novels/all');
      scrollTo(900);
      expect(hidden()).toBe(false);
    });

    it('does not animate with prefers-reduced-motion', () => {
      const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{(?:[^{}]*\{[^}]*\}\s*)*?[^{}]*\.topbar--hidden[^{}]*\{([^}]*)\}/.exec(css)?.[1] ?? '';
      expect(reduced).toMatch(/transition:\s*none/);
      expect(/\.topbar--hidden\s*\{[^}]*transform:/.test(css)).toBe(true);
    });
  });
});
