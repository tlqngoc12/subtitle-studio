import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { PhotoPost } from '../api/photos';
import { SiteProvider } from '../data/SiteContext';
import { answerConfirm } from '../test/confirm';
import { fakeFetch, type Route as FakeRoute } from '../test/fakeFetch';
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

  it('a member also gets the posts tagged with the group; the group gets only its own', async () => {
    renderPhotos(
      [
        photo(1, { profiles: ['emi'] }),
        photo(2, { profiles: ['emibonnie'] }),
        photo(3, { profiles: ['bonnie'] }),
        photo(4, { profiles: ['emibonnie', 'emi'] }),
      ],
      '/photos?who=emi',
    );
    const names = () => screen.getAllByRole('link', { name: /^Post / }).map((l) => l.getAttribute('aria-label'));

    await screen.findAllByRole('link', { name: /^Post / });
    expect(names()).toEqual(['Post 1', 'Post 2', 'Post 4']);

    await userEvent.click(screen.getByRole('button', { name: 'Bonnie' }));
    expect(names()).toEqual(['Post 2', 'Post 3', 'Post 4']);

    await userEvent.click(screen.getByRole('button', { name: 'EmiBonnie' }));
    expect(names()).toEqual(['Post 2', 'Post 4']);
  });

  it('changes the filter when an avatar is chosen', async () => {
    renderPhotos([photo(1, { profiles: ['emi'] }), photo(2, { profiles: ['bonnie'] })]);

    await screen.findAllByRole('link', { name: /^Post / });
    await userEvent.click(screen.getByRole('button', { name: 'Bonnie' }));

    expect(screen.getAllByRole('link', { name: /^Post / }).map((l) => l.getAttribute('aria-label'))).toEqual(['Post 2']);
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getAllByRole('link', { name: /^Post / })).toHaveLength(2);
  });

  it('opens the Instagram post in a new tab and shows chips, title and one date', async () => {
    renderPhotos([
      photo(1, { photoCount: 3, source: 'FAN', takenOn: '2026-10-31', title: 'Fan meeting' }),
      photo(2, { photoCount: 1 }),
    ]);

    const tile = await screen.findByRole('link', { name: 'Fan meeting' });
    expect(tile).toHaveAttribute('href', 'https://www.instagram.com/p/POST1/');
    expect(tile).toHaveAttribute('target', '_blank');
    expect(tile).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(tile).getByText('Fan')).toBeInTheDocument();
    expect(within(tile).getByText('3 photos')).toBeInTheDocument();
    expect(within(tile).getByText('31 Oct 2026')).toBeInTheDocument();
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

describe('PhotosPage admin', () => {
  const POSTS = [photo(1, { profiles: ['emi'] }), photo(2)];
  const GET_PHOTOS: FakeRoute = { method: 'GET', path: '/api/photos', status: 200, body: POSTS };
  const GET_PROFILES: FakeRoute = { method: 'GET', path: '/api/profiles', status: 200, body: PROFILES };

  function renderAdmin() {
    return render(
      <MemoryRouter initialEntries={['/photos']}>
        <Routes>
          <Route path="/photos" element={<PhotosPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('shows Add post and a menu on every tile', async () => {
    fakeFetch([GET_PHOTOS, GET_PROFILES]);
    renderAdmin();

    await screen.findAllByRole('link', { name: /^Post / });
    expect(screen.getByRole('button', { name: 'Add post' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu for Post 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Menu for Post 2' })).toBeInTheDocument();
  });

  it('shows neither on the public site', async () => {
    renderPhotos(POSTS);

    await screen.findAllByRole('link', { name: /^Post / });
    expect(screen.queryByRole('button', { name: 'Add post' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Menu for/ })).not.toBeInTheDocument();
  });

  it('deletes a post after confirming', async () => {
    const calls = fakeFetch([GET_PHOTOS, GET_PROFILES, { method: 'DELETE', path: '/api/photos/1', status: 204 }]);
    renderAdmin();
    await screen.findAllByRole('link', { name: /^Post / });

    await userEvent.click(screen.getByRole('button', { name: 'Menu for Post 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await answerConfirm('Delete', 'Delete “Post 1”?');

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Post 1' })).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('opens the edit dialog with the post filled in', async () => {
    fakeFetch([GET_PHOTOS, GET_PROFILES]);
    renderAdmin();
    await screen.findAllByRole('link', { name: /^Post / });

    await userEvent.click(screen.getByRole('button', { name: 'Menu for Post 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(await screen.findByRole('dialog', { name: 'Edit post' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Post 2');
  });

  it('adds a post through the dialog and shows its tile', async () => {
    const created = photo(9, { title: 'Brand new', takenOn: '2026-11-10' });
    fakeFetch([
      GET_PHOTOS,
      GET_PROFILES,
      { method: 'POST', path: '/api/media?maxSide=1600', status: 201, body: { id: 9, url: '/api/media/9', width: 1, height: 1 } },
      { method: 'POST', path: '/api/photos', status: 201, body: created },
    ]);
    renderAdmin();
    await screen.findAllByRole('link', { name: /^Post / });

    await userEvent.click(screen.getByRole('button', { name: 'Add post' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add post' });
    await userEvent.type(within(dialog).getByLabelText('Post link (Instagram or X)'), 'https://www.instagram.com/p/NEW/');
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Brand new');
    await userEvent.click(within(dialog).getByLabelText('Date'));
    await userEvent.click(await screen.findByRole('button', { name: 'Today' }));
    await userEvent.upload(within(dialog).getByLabelText('Image file'), new File(['x'], 'a.png', { type: 'image/png' }));
    await within(dialog).findByRole('img', { name: 'Selected image' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('link', { name: 'Brand new' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
