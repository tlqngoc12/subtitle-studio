import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { PhotoPost } from '../api/photos';
import { SiteProvider } from '../data/SiteContext';
import { fakeSource, publicSite } from '../test/fakeSource';
import { photo } from '../test/photoFixtures';
import { page, profile } from '../test/profileFixtures';
import PhotosPage from './PhotosPage';

const PROFILES = page(
  [profile('emi', 'Emi', []), profile('bonnie', 'Bonnie', [])],
  profile('emibonnie', 'EmiBonnie', [], [], { portraitUrl: '/media/g.webp' }),
);

function renderPhotos(posts: PhotoPost[], path = '/photos') {
  const source = fakeSource({ listPhotos: async () => posts, getProfilePage: async () => PROFILES });
  return render(
    <SiteProvider value={publicSite(source)}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/photos" element={<PhotosPage />} />
        </Routes>
      </MemoryRouter>
    </SiteProvider>,
  );
}

const many = (n: number) => Array.from({ length: n }, (_, i) => photo(i + 1));

describe('PhotosPage', () => {
  it('shows 24 tiles first and Load more adds the rest', async () => {
    renderPhotos(many(30));

    expect(await screen.findAllByRole('link', { name: /^Post / })).toHaveLength(24);
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(screen.getAllByRole('link', { name: /^Post / })).toHaveLength(30);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('filters by person from ?who=', async () => {
    renderPhotos(
      [photo(1, { profiles: ['emi'] }), photo(2, { profiles: ['bonnie'] }), photo(3, { profiles: ['emi', 'bonnie'] })],
      '/photos?who=emi',
    );

    const links = await screen.findAllByRole('link', { name: /^Post / });
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual(['Post 1', 'Post 3']);
    expect(screen.getByRole('button', { name: 'Emi' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('changes the filter when an avatar is chosen', async () => {
    renderPhotos([photo(1, { profiles: ['emi'] }), photo(2, { profiles: ['bonnie'] })]);

    await screen.findAllByRole('link', { name: /^Post / });
    await userEvent.click(screen.getByRole('button', { name: 'Bonnie' }));

    expect(screen.getAllByRole('link', { name: /^Post / }).map((l) => l.getAttribute('aria-label'))).toEqual(['Post 2']);
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getAllByRole('link', { name: /^Post / })).toHaveLength(2);
  });

  it('opens the Instagram post in a new tab and shows chips, title and date range', async () => {
    renderPhotos([
      photo(1, { photoCount: 3, source: 'FAN', takenOn: '2026-10-31', takenUntil: '2026-11-01', title: 'Fan meeting' }),
      photo(2, { photoCount: 1 }),
    ]);

    const tile = await screen.findByRole('link', { name: 'Fan meeting' });
    expect(tile).toHaveAttribute('href', 'https://www.instagram.com/p/POST1/');
    expect(tile).toHaveAttribute('target', '_blank');
    expect(tile).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(tile).getByText('Fan')).toBeInTheDocument();
    expect(within(tile).getByText('3 photos')).toBeInTheDocument();
    expect(within(tile).getByText('31 Oct 2026 – 1 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('1 photo')).toBeInTheDocument();
  });

  it('gives each tile a shape class from the image size', async () => {
    renderPhotos([
      photo(1, { width: 1080, height: 1350 }),
      photo(2, { width: 1600, height: 900 }),
      photo(3, { width: 1080, height: 1080 }),
    ]);

    const [tall, wide, square] = await screen.findAllByRole('link', { name: /^Post / });
    expect(tall).toHaveClass('photo-tile--tall');
    expect(wide).toHaveClass('photo-tile--wide');
    expect(square).toHaveClass('photo-tile--square');
  });

  it('shows an empty state without posts', async () => {
    renderPhotos([]);

    expect(await screen.findByText('No photos here yet.')).toBeInTheDocument();
  });
});
