import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { describe, expect, it } from 'vitest';
import { answerConfirm } from '../test/confirm';
import { fakeFetch, problem } from '../test/fakeFetch';
import { loadedRegion } from '../test/loadedRegion';
import { detail, summary } from '../test/playlistFixtures';
import PlaylistsPage from './PlaylistsPage';

function EditStub() {
  const { playlistId } = useParams();
  return <p>edit {playlistId}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/vietsub/playlists']}>
      <Routes>
        <Route path="/vietsub/playlists" element={<PlaylistsPage />} />
        <Route path="/vietsub/playlists/:playlistId" element={<EditStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

const vlog = summary(1, 'VLOG OF US', 3);
const empty = summary(2, 'Empty one', 0);

describe('PlaylistsPage', () => {
  it('shows the Videos / Playlists tabs with Playlists current', async () => {
    fakeFetch([{ method: 'GET', path: '/api/playlists', status: 200, body: [] }]);
    renderPage();

    const tabs = screen.getByRole('navigation', { name: 'Vietsub' });
    expect(within(tabs).getByRole('link', { name: 'Videos' })).toHaveAttribute('href', '/vietsub');
    expect(within(tabs).getByRole('link', { name: 'Playlists' })).toHaveAttribute('aria-current', 'page');
    expect(within(tabs).getByRole('link', { name: 'Videos' })).not.toHaveAttribute('aria-current');
  });

  it('lists playlists with cover, count and an Edit link', async () => {
    fakeFetch([{ method: 'GET', path: '/api/playlists', status: 200, body: [vlog] }]);
    renderPage();

    const region = await loadedRegion('Playlists');
    const row = within(region).getByRole('listitem');
    expect(within(row).getByText('VLOG OF US')).toBeInTheDocument();
    expect(within(row).getByText('3 videos')).toBeInTheDocument();
    expect(row.querySelector('img')).toHaveAttribute('src', 'https://i.ytimg.com/vi/COVER1/mqdefault.jpg');
    expect(within(row).getByRole('link', { name: 'Edit playlist: VLOG OF US' })).toHaveAttribute(
      'href',
      '/vietsub/playlists/1',
    );
  });

  it('shows a placeholder instead of a cover for an empty playlist', async () => {
    fakeFetch([{ method: 'GET', path: '/api/playlists', status: 200, body: [empty] }]);
    renderPage();

    const row = within(await loadedRegion('Playlists')).getByRole('listitem');
    expect(row.querySelector('img')).toBeNull();
    expect(within(row).getByText('0 videos')).toBeInTheDocument();
  });

  it('says "1 video" for a single video', async () => {
    fakeFetch([{ method: 'GET', path: '/api/playlists', status: 200, body: [summary(3, 'One', 1)] }]);
    renderPage();

    expect(within(await loadedRegion('Playlists')).getByText('1 video')).toBeInTheDocument();
  });

  it('creates a playlist from the form and puts it first', async () => {
    const calls = fakeFetch([
      { method: 'GET', path: '/api/playlists', status: 200, body: [vlog] },
      { method: 'POST', path: '/api/playlists', status: 201, body: detail(5, 'VLOG', [], 'Short clips') },
    ]);
    renderPage();
    await loadedRegion('Playlists');
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Name'), 'VLOG');
    await user.type(screen.getByLabelText('Description (optional)'), 'Short clips');
    await user.click(screen.getByRole('button', { name: 'Create playlist' }));

    const post = calls.find((c) => c.method === 'POST');
    expect(JSON.parse(String(post?.body))).toEqual({ name: 'VLOG', description: 'Short clips' });
    const region = await loadedRegion('Playlists');
    await waitFor(() =>
      expect(within(region).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
        expect.stringContaining('VLOG0 videos'),
        expect.stringContaining('VLOG OF US'),
      ]),
    );
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('shows the server field error next to the name', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/playlists', status: 200, body: [] },
      {
        method: 'POST',
        path: '/api/playlists',
        status: 400,
        body: { ...problem(400, 'INVALID_PLAYLIST', 'Invalid playlist: [name]'), errors: [{ field: 'name', message: 'Name must be at most 100 characters' }] },
      },
    ]);
    renderPage();
    await loadedRegion('Playlists');
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Name'), 'x');
    await user.click(screen.getByRole('button', { name: 'Create playlist' }));

    expect(await screen.findByText('Name must be at most 100 characters')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Check the playlist name and description.');
  });

  it('requires a name before sending', async () => {
    const calls = fakeFetch([{ method: 'GET', path: '/api/playlists', status: 200, body: [] }]);
    renderPage();
    await loadedRegion('Playlists');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Create playlist' }));

    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('deletes a playlist after confirming', async () => {
    const calls = fakeFetch([
      { method: 'GET', path: '/api/playlists', status: 200, body: [vlog, empty] },
      { method: 'DELETE', path: '/api/playlists/1', status: 204 },
    ]);
    renderPage();
    const region = await loadedRegion('Playlists');

    await userEvent.setup().click(within(region).getByRole('button', { name: 'Delete playlist: VLOG OF US' }));
    await answerConfirm('Delete', 'Delete the playlist "VLOG OF US"?');

    await waitFor(() => expect(within(region).getAllByRole('listitem')).toHaveLength(1));
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/playlists/1')).toBe(true);
  });

  it('keeps the playlist when the delete is cancelled', async () => {
    const calls = fakeFetch([{ method: 'GET', path: '/api/playlists', status: 200, body: [vlog] }]);
    renderPage();
    const region = await loadedRegion('Playlists');

    await userEvent.setup().click(within(region).getByRole('button', { name: 'Delete playlist: VLOG OF US' }));
    await answerConfirm('Cancel');

    expect(within(region).getAllByRole('listitem')).toHaveLength(1);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('shows an empty state when there are no playlists', async () => {
    fakeFetch([{ method: 'GET', path: '/api/playlists', status: 200, body: [] }]);
    renderPage();

    expect(within(await loadedRegion('Playlists')).getByText(/No playlists yet/)).toBeInTheDocument();
  });
});
