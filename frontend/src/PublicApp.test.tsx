import { render, screen, within } from '@testing-library/react';
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
  '/data/profiles.json': [{ slug: 'emibonnie', displayName: 'EmiBonnie' }, { slug: 'emi', displayName: 'Emi' }],
  '/data/profiles/emi.json': {
    slug: 'emi', displayName: 'Emi', updatedAt: 'x',
    blocks: [{ id: 1, type: 'TEXT', title: null, body: 'Trang của Emi', mediaId: null, mediaUrl: null, caption: null, embedUrl: null, items: [] }],
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
  it('rootOpensVietsubList', async () => {
    renderAt('/');

    expect(await screen.findByText('Us EP.5')).toBeInTheDocument();
    expect(screen.getByLabelText('path')).toHaveTextContent('/vietsub/list');
  });

  it('navHasOnlyPublicSections', async () => {
    renderAt('/vietsub/list');

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Vietsub list', 'Profile']);
    expect(screen.queryByRole('button', { name: /Publish/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Subtitle Studio' })).toHaveAttribute('href', '/vietsub/list');
    await screen.findByText('Us EP.5');
  });

  it('footerShowsCreditAndYear', async () => {
    renderAt('/vietsub/list');

    expect(
      await screen.findByText('Vietsub by @byZenQN · All videos are the property of their original creators · Updated 2026'),
    ).toBeInTheDocument();
  });

  it('unknownRouteShowsNotFound', async () => {
    renderAt('/vietsub');

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Vietsub list' })).toHaveAttribute('href', '/vietsub/list');
  });

  it('profileIsReadOnly', async () => {
    renderAt('/profiles/emi');

    expect(await screen.findByText('Trang của Emi')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });
});
