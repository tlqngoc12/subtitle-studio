import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaylistDetail } from '../api/playlists';
import { AppToaster } from '../components/AppToaster';
import { answerConfirm } from '../test/confirm';
import { fakeFetch, problem, type Route as FakeRoute } from '../test/fakeFetch';
import { detail, vsVideo } from '../test/playlistFixtures';
import PlaylistEditPage from './PlaylistEditPage';

const A = vsVideo('aaaaaaaaaaa', 'Alpha');
const B = vsVideo('bbbbbbbbbbb', 'Bravo');
const C = vsVideo('ccccccccccc', 'Charlie');
const PL = detail(4, 'VLOG OF US', [A, B, C], 'Daily');

function WatchStub() {
  const { pathname, search, state } = useLocation();
  return <p>watch {pathname + search} autoplay={String((state as { autoplay?: boolean } | null)?.autoplay)}</p>;
}

function renderPage(routes: FakeRoute[]) {
  const calls = fakeFetch(routes);
  render(
    <MemoryRouter initialEntries={['/vietsub/playlists/4']}>
      <AppToaster />
      <Routes>
        <Route path="/vietsub/playlists/:playlistId" element={<PlaylistEditPage />} />
        <Route path="/vietsub/playlists" element={<p>playlists page</p>} />
        <Route path="/vietsub/:id" element={<WatchStub />} />
      </Routes>
    </MemoryRouter>,
  );
  return calls;
}

const get = (body: PlaylistDetail = PL): FakeRoute => ({ method: 'GET', path: '/api/playlists/4', status: 200, body });

async function rows() {
  const region = await screen.findByRole('region', { name: 'Videos in this playlist' });
  await waitFor(() => expect(within(region).queryByText('Loading…')).not.toBeInTheDocument());
  return () => within(region).queryAllByRole('listitem').map((li) => li.textContent ?? '');
}

describe('PlaylistEditPage', () => {
  it('shows the videos numbered in order', async () => {
    renderPage([get()]);
    const texts = await rows();

    expect(texts()).toEqual([
      expect.stringMatching(/^1.*Alpha/),
      expect.stringMatching(/^2.*Bravo/),
      expect.stringMatching(/^3.*Charlie/),
    ]);
    expect(screen.getByRole('heading', { level: 1, name: 'VLOG OF US' })).toBeInTheDocument();
    expect(screen.getByText('Daily')).toBeInTheDocument();
    expect(screen.getByText('3 videos')).toBeInTheDocument();
  });

  it('renames the playlist in place', async () => {
    const calls = renderPage([
      get(),
      { method: 'PATCH', path: '/api/playlists/4', status: 200, body: { ...PL, name: 'Mới' } },
    ]);
    await rows();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Mới');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Mới' })).toBeInTheDocument();
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(JSON.parse(String(patch?.body))).toEqual({ name: 'Mới' });
  });

  it('moves a video down with the button and saves the order', async () => {
    const calls = renderPage([
      get(),
      { method: 'PUT', path: '/api/playlists/4/order', status: 200, body: detail(4, 'VLOG OF US', [B, A, C]) },
    ]);
    const texts = await rows();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Move down: Alpha' }));

    expect(texts()).toEqual([
      expect.stringMatching(/^1.*Bravo/),
      expect.stringMatching(/^2.*Alpha/),
      expect.stringMatching(/^3.*Charlie/),
    ]);
    const put = calls.find((c) => c.method === 'PUT');
    expect(JSON.parse(String(put?.body))).toEqual({ videoIds: [B.id, A.id, C.id] });
  });

  it('disables Move up on the first video and Move down on the last', async () => {
    renderPage([get()]);
    await rows();

    expect(screen.getByRole('button', { name: 'Move up: Alpha' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move down: Charlie' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move down: Alpha' })).toBeEnabled();
  });

  describe('drag and drop', () => {
    // jsdom has no layout; give each row a box so dnd-kit's keyboard sensor can find the next one.
    let spy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const li = this.closest('li');
        const index = li?.parentElement ? Array.from(li.parentElement.children).indexOf(li) : 0;
        const top = index * 60;
        return { x: 0, y: top, top, left: 0, right: 600, bottom: top + 50, width: 600, height: 50, toJSON() {} } as DOMRect;
      });
    });
    afterEach(() => spy.mockRestore());

    it('reorders with the keyboard (Space, ArrowDown, Space)', async () => {
      const calls = renderPage([
        get(),
        { method: 'PUT', path: '/api/playlists/4/order', status: 200, body: detail(4, 'VLOG OF US', [B, A, C]) },
      ]);
      await rows();
      const handle = screen.getByRole('button', { name: 'Drag to reorder: Alpha' });

      // dnd-kit attaches its keyboard listeners in a setTimeout after the drag starts.
      const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));
      handle.focus();
      fireEvent.keyDown(handle, { key: ' ', code: 'Space' });
      await tick();
      fireEvent.keyDown(document.activeElement ?? handle, { key: 'ArrowDown', code: 'ArrowDown' });
      await tick();
      fireEvent.keyDown(document.activeElement ?? handle, { key: ' ', code: 'Space' });

      await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
      const put = calls.find((c) => c.method === 'PUT');
      expect(JSON.parse(String(put?.body))).toEqual({ videoIds: [B.id, A.id, C.id] });
    });
  });

  it('restores the old order when saving fails', async () => {
    renderPage([
      get(),
      { method: 'PUT', path: '/api/playlists/4/order', status: 500, body: problem(500, 'INTERNAL_ERROR', 'boom') },
    ]);
    const texts = await rows();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Move down: Alpha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The server ran into an error');
    expect(texts()).toEqual([
      expect.stringMatching(/^1.*Alpha/),
      expect.stringMatching(/^2.*Bravo/),
      expect.stringMatching(/^3.*Charlie/),
    ]);
  });

  it('locks Remove while an order is being saved', async () => {
    let release!: () => void;
    const delay = new Promise<void>((r) => (release = r));
    renderPage([
      get(),
      {
        method: 'PUT',
        path: '/api/playlists/4/order',
        status: 500,
        body: problem(500, 'INTERNAL_ERROR', 'boom'),
        delay,
      },
    ]);
    await rows();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Move down: Alpha' }));

    // Otherwise restoring the old order after a failure would bring back a video removed meanwhile.
    expect(screen.getByRole('button', { name: 'Remove from playlist: Charlie' })).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove from playlist: Charlie' })).toBeEnabled());
  });

  it('reloads the playlist when the order is stale', async () => {
    const routes: FakeRoute[] = [
      get(),
      {
        method: 'PUT',
        path: '/api/playlists/4/order',
        status: 400,
        body: problem(400, 'INVALID_PLAYLIST_ORDER', 'stale'),
      },
    ];
    const calls = renderPage(routes);
    const texts = await rows();
    routes[0] = get(detail(4, 'VLOG OF US', [C, A]));

    await userEvent.setup().click(screen.getByRole('button', { name: 'Move down: Alpha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The playlist changed meanwhile. It has been reloaded.');
    await waitFor(() =>
      expect(texts()).toEqual([expect.stringMatching(/^1.*Charlie/), expect.stringMatching(/^2.*Alpha/)]),
    );
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2);
  });

  it('removes a video and renumbers', async () => {
    const calls = renderPage([get(), { method: 'DELETE', path: `/api/playlists/4/videos/${B.id}`, status: 204 }]);
    const texts = await rows();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove from playlist: Bravo' }));

    await waitFor(() =>
      expect(texts()).toEqual([expect.stringMatching(/^1.*Alpha/), expect.stringMatching(/^2.*Charlie/)]),
    );
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
    expect(screen.getByText('2 videos')).toBeInTheDocument();
  });

  it('deletes the playlist after confirming and goes back to Playlists', async () => {
    const calls = renderPage([get(), { method: 'DELETE', path: '/api/playlists/4', status: 204 }]);
    await rows();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete playlist' }));
    await answerConfirm('Delete', 'Delete the playlist "VLOG OF US"?');

    expect(await screen.findByText('playlists page')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/playlists/4')).toBe(true);
  });

  it('keeps Delete playlist away from Play all, at the end of the page', async () => {
    renderPage([get()]);
    await rows();

    const del = screen.getByRole('button', { name: 'Delete playlist' });
    const videos = screen.getByRole('region', { name: 'Videos in this playlist' });
    expect(videos.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Play all' }).parentElement).not.toContainElement(del);
  });

  it('links Play all to the first video in playlist mode', async () => {
    renderPage([get()]);
    await rows();

    expect(screen.getByRole('link', { name: 'Play all' })).toHaveAttribute('href', `/vietsub/${A.id}?playlist=4`);
  });

  it('starts playing right away after Play all', async () => {
    renderPage([get()]);
    await rows();

    await userEvent.setup().click(screen.getByRole('link', { name: 'Play all' }));

    expect(await screen.findByText(`watch /vietsub/${A.id}?playlist=4 autoplay=true`)).toBeInTheDocument();
  });

  it('shows a hint and no Play all for an empty playlist', async () => {
    renderPage([get(detail(4, 'Empty', []))]);
    await rows();

    expect(screen.getByText(/Use Save to playlist in the Videos tab to add videos/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Play all' })).not.toBeInTheDocument();
  });

  it('says the playlist is gone when it does not exist', async () => {
    renderPage([
      { method: 'GET', path: '/api/playlists/4', status: 404, body: problem(404, 'PLAYLIST_NOT_FOUND', 'gone') },
    ]);

    expect(await screen.findByRole('alert')).toHaveTextContent('This playlist no longer exists.');
    expect(screen.getByRole('link', { name: 'Back to Playlists' })).toHaveAttribute('href', '/vietsub/playlists');
  });
});
