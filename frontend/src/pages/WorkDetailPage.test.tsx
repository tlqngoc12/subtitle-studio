import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import type { Work } from '../api/works';
import { SiteProvider } from '../data/SiteContext';
import { fakeFetch } from '../test/fakeFetch';
import { fakeSource, publicSite } from '../test/fakeSource';
import { person, work } from '../test/workFixtures';
import WorkDetailPage from './WorkDetailPage';

function renderPublic(w: Work | null, path = '/works/5') {
  const source = fakeSource({
    getWork: async (id) => {
      if (w === null || id !== w.id) throw new ApiError(404, 'WORK_NOT_FOUND', 'x');
      return w;
    },
  });
  return render(
    <SiteProvider value={publicSite(source)}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/works/:id" element={<WorkDetailPage />} />
        </Routes>
      </MemoryRouter>
    </SiteProvider>,
  );
}

const FILM = work(5, {
  title: 'Love Story',
  categories: ['FILM_TV'],
  subcategory: 'Drama',
  releaseDate: '2026-04-24',
  description: 'Line one\nLine two',
  coverUrl: '/media/c.webp',
  links: [
    { kind: 'PILOT', label: 'Pilot', url: 'https://www.netflix.com/title/1', icon: null },
    { kind: 'OTHER', label: 'Official site', url: 'https://www.iq.com/play/x', icon: null },
  ],
  credits: [
    { person: person(1, 'Bonnie'), role: 'Lead', characterName: 'Key' },
    { person: person(2, 'Emi', { avatarUrl: '/media/e.webp' }), role: 'Lead', characterName: null },
  ],
  trailerVideoId: 'dQw4w9WgXcQ',
});

describe('WorkDetailPage', () => {
  it('shows a film with cast, characters, date, description and link buttons in new tabs', async () => {
    renderPublic(FILM);

    expect(await screen.findByRole('heading', { level: 1, name: 'Love Story' })).toBeInTheDocument();
    expect(screen.getByText('24 Apr 2026')).toBeInTheDocument();
    expect(screen.getByText('Film & TV')).toBeInTheDocument();
    expect(screen.getByText('Drama')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Cast' })).toBeInTheDocument();
    expect(screen.getByText('as Key')).toBeInTheDocument();
    expect(screen.getAllByText(/^as /)).toHaveLength(1);
    const pilot = screen.getByRole('link', { name: 'Pilot' });
    expect(pilot).toHaveAttribute('href', 'https://www.netflix.com/title/1');
    expect(pilot).toHaveAttribute('target', '_blank');
    expect(pilot).toHaveAttribute('rel', 'noopener noreferrer');
    expect(pilot.querySelector('svg')).toHaveAttribute('data-platform', 'netflix');
    expect(screen.getByRole('link', { name: 'Official site' }).querySelector('svg')).not.toHaveAttribute('data-platform');
    expect(screen.getByText(/Line one/)).toHaveClass('work__description');
  });

  it('shows Artists and no characters for music, and Coming Soon without a date', async () => {
    renderPublic(
      work(5, {
        categories: ['MUSIC'],
        releaseDate: null,
        credits: [{ person: person(1, 'Bonnie'), role: 'Singer', characterName: null }],
      }),
    );

    expect(await screen.findByRole('heading', { level: 2, name: 'Artists' })).toBeInTheDocument();
    expect(screen.getByText('Singer')).toBeInTheDocument();
    expect(screen.queryByText(/^as /)).not.toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('says Cast when Film & TV is one of several categories and People for music with another category', async () => {
    const credits = [{ person: person(1, 'Emi'), role: null, characterName: 'Key' }];
    const { unmount } = renderPublic(work(5, { categories: ['MUSIC', 'FILM_TV'], credits }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Cast' })).toBeInTheDocument();
    expect(screen.getByText('Film & TV')).toBeInTheDocument();
    expect(screen.getByText('Music')).toBeInTheDocument();
    unmount();

    renderPublic(work(5, { categories: ['MUSIC', 'VARIETY'], credits }));
    expect(await screen.findByRole('heading', { level: 2, name: 'People' })).toBeInTheDocument();
  });

  it('uses People for other categories and hides the section without credits', async () => {
    renderPublic(work(5, { categories: ['VARIETY'], credits: [{ person: person(1, 'Emi'), role: null, characterName: null }] }));
    expect(await screen.findByRole('heading', { level: 2, name: 'People' })).toBeInTheDocument();
  });

  it('shows the trailer poster first, then the player after a click', async () => {
    renderPublic(FILM);

    const play = await screen.findByRole('button', { name: 'Play trailer: Love Story' });
    expect(within(play).getByRole('presentation', { hidden: true })).toHaveAttribute(
      'src',
      'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
    expect(document.querySelector('iframe')).toBeNull();

    await userEvent.click(play);

    expect(document.querySelector('iframe')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1',
    );
  });

  it('has no embed without a trailer', async () => {
    renderPublic(work(5, { title: 'No trailer', trailerVideoId: null }));

    await screen.findByRole('heading', { name: 'No trailer' });
    expect(screen.queryByRole('button', { name: /Play trailer/ })).not.toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it.each(['/works/999', '/works/abc', '/works/0', '/works/-3'])('%s shows Work not found', async (path) => {
    renderPublic(FILM, path);

    expect(await screen.findByRole('heading', { name: 'Work not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Works' })).toHaveAttribute('href', '/works');
  });

  it('shows Edit only to the admin', async () => {
    renderPublic(FILM);
    await screen.findByRole('heading', { name: 'Love Story' });
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('shows Edit in the admin app', async () => {
    fakeFetch([{ method: 'GET', path: '/api/works/5', status: 200, body: FILM }]);
    render(
      <MemoryRouter initialEntries={['/works/5']}>
        <Routes>
          <Route path="/works/:id" element={<WorkDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/works/5/edit');
  });
});
