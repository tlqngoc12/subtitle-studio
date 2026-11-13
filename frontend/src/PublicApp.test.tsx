import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import PublicApp from './PublicApp';

const VIDEO = {
  id: 'dQw4w9WgXcQ', title: 'Us EP.5', channel: 'GMMTV', durationSec: 364,
  thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg', viCueCount: 2,
  viUpdatedAt: '2026-11-04T10:00:00Z', viSource: 'AUTO',
};

const FILES: Record<string, unknown> = {
  '/data/site.json': { publishedAt: '2026-11-04T10:00:00Z', year: 2026 },
  '/data/videos.json': [VIDEO],
  '/data/playlists.json': [],
  '/data/novels.json': [],
  '/data/novels/abc.json': {
    slug: 'abc', title: 'ABC', coverUrl: null, originalAuthor: null, description: null, tags: [], novelStatus: 'ONGOING',
    translatorCredit: null, sourceUrl: null, chapters: [{ chapterNo: 2, title: null }],
  },
  '/data/novels/abc/2.json': { chapterNo: 2, title: null, prev: null, next: null, images: ['/novels/abc/x-1.webp'] },
  '/data/profiles.json': {
    group: { slug: 'emibonnie', displayName: 'EmiBonnie', kind: 'GROUP', updatedAt: 'x', blocks: [], banner: [] },
    members: [{
      slug: 'emi', displayName: 'Emi', kind: 'MEMBER', tagline: null, fullName: null, portraitUrl: null, updatedAt: 'x',
      blocks: [{ id: 1, type: 'TEXT', title: null, body: 'Trang của Emi', mediaId: null, mediaUrl: null, caption: null, embedUrl: null, items: [] }],
      banner: [],
    }],
  },
};

function serveStaticSite() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (!(path in FILES)) return new Response('Not found', { status: 404 });
      return new Response(JSON.stringify(FILES[path]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
}

function Location() {
  return <output aria-label="path">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  serveStaticSite();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PublicApp />
      <Location />
    </MemoryRouter>,
  );
}

describe('PublicApp', () => {
  it('opens a new page scrolled to the top', async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    renderAt('/vietsub/list');
    await screen.findByRole('tab', { name: 'Danh sách phát' });
    scrollTo.mockClear();

    await userEvent.setup().click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Novels' }));

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('rootOpensVietsubList', async () => {
    renderAt('/');

    expect(await screen.findByRole('tab', { name: 'Danh sách phát' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/Chưa có danh sách phát nào./)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Create a playlist' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('path')).toHaveTextContent('/vietsub/list');
  });

  it('navHasOnlyPublicSections', async () => {
    renderAt('/vietsub/list');

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Vietsub', 'Profile', 'Works', 'Photos', 'Novels']);
    expect(screen.queryByRole('button', { name: /Publish/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Subtitle Studio' })).toHaveAttribute('href', '/vietsub/list');
    await screen.findByText(/Chưa có danh sách phát nào./);
  });

  it('footerShowsCreditAndYear', async () => {
    renderAt('/vietsub/list');

    expect(
      await screen.findByText('Vietsub bởi @byZenQN · Mọi video thuộc quyền sở hữu của người tạo ra chúng · Cập nhật 2026'),
    ).toBeInTheDocument();
  });

  it('unknownRouteShowsNotFound', async () => {
    renderAt('/vietsub');

    expect(await screen.findByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang Vietsub' })).toHaveAttribute('href', '/vietsub/list');
  });

  it('profileIsReadOnly', async () => {
    renderAt('/profiles/emi');

    expect(await screen.findByText('Trang của Emi')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('novelsAllRedirectsToTheNovelsPage', async () => {
    renderAt('/novels/all');

    expect(await screen.findByRole('heading', { level: 1, name: 'Truyện' })).toBeInTheDocument();
    expect(screen.getByLabelText('path')).toHaveTextContent(/^\/novels$/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('novelsShelfIsItsOwnPageNotANovel', async () => {
    renderAt('/novels/shelf');

    expect(await screen.findByRole('heading', { level: 1, name: 'Tủ sách' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('readerOpensAChapter', async () => {
    renderAt('/novels/abc/2');

    expect(await screen.findByRole('img', { name: 'Chương 2, trang 1/1' })).toHaveAttribute('src', '/novels/abc/x-1.webp');
  });
});
