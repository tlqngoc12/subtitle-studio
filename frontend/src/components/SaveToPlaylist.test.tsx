import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeFetch, problem } from '../test/fakeFetch';
import { detail, summary, vsVideo } from '../test/playlistFixtures';
import { AppToaster } from './AppToaster';
import { SaveToPlaylist } from './SaveToPlaylist';

const VIDEO = vsVideo('aaaaaaaaaaa', 'Chợ đêm Bangkok');
const LIST = `/api/playlists?videoId=${VIDEO.id}`;

function renderButton() {
  render(
    <>
      <AppToaster />
      <SaveToPlaylist video={VIDEO} />
    </>,
  );
}

async function openPopover() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Save to playlist: Chợ đêm Bangkok' }));
  const dialog = await screen.findByRole('dialog', { name: 'Save to playlist' });
  await waitFor(() => expect(within(dialog).queryByText('Loading playlists…')).not.toBeInTheDocument());
  return { user, dialog };
}

describe('SaveToPlaylist', () => {
  it('lists the playlists with the ones holding the video ticked', async () => {
    fakeFetch([
      {
        method: 'GET',
        path: LIST,
        status: 200,
        body: [summary(1, 'VLOG', 2, { containsVideo: true }), summary(2, 'Food', 0, { containsVideo: false })],
      },
    ]);
    renderButton();

    const { dialog } = await openPopover();

    expect(within(dialog).getByRole('checkbox', { name: 'VLOG' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Food' })).not.toBeChecked();
  });

  it('adds the video when a playlist is ticked', async () => {
    const calls = fakeFetch([
      { method: 'GET', path: LIST, status: 200, body: [summary(1, 'VLOG', 0, { containsVideo: false })] },
      { method: 'POST', path: '/api/playlists/1/videos', status: 200, body: detail(1, 'VLOG', [VIDEO]) },
    ]);
    renderButton();
    const { user, dialog } = await openPopover();

    await user.click(within(dialog).getByRole('checkbox', { name: 'VLOG' }));

    expect(await screen.findByText('Saved to VLOG')).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: 'VLOG' })).toBeChecked();
    const post = calls.find((c) => c.method === 'POST');
    expect(JSON.parse(String(post?.body))).toEqual({ videoId: VIDEO.id });
  });

  it('removes the video when a playlist is unticked', async () => {
    const calls = fakeFetch([
      { method: 'GET', path: LIST, status: 200, body: [summary(1, 'VLOG', 1, { containsVideo: true })] },
      { method: 'DELETE', path: `/api/playlists/1/videos/${VIDEO.id}`, status: 204 },
    ]);
    renderButton();
    const { user, dialog } = await openPopover();

    await user.click(within(dialog).getByRole('checkbox', { name: 'VLOG' }));

    expect(await screen.findByText('Removed from VLOG')).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: 'VLOG' })).not.toBeChecked();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('disables the checkbox while saving so a double click sends one request', async () => {
    let release!: () => void;
    const delay = new Promise<void>((r) => (release = r));
    const calls = fakeFetch([
      { method: 'GET', path: LIST, status: 200, body: [summary(1, 'VLOG', 0, { containsVideo: false })] },
      { method: 'POST', path: '/api/playlists/1/videos', status: 200, body: detail(1, 'VLOG', [VIDEO]), delay },
    ]);
    renderButton();
    const { user, dialog } = await openPopover();
    const box = within(dialog).getByRole('checkbox', { name: 'VLOG' });

    await user.click(box);
    expect(box).toBeDisabled();
    await user.click(box);
    release();

    await waitFor(() => expect(box).not.toBeDisabled());
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(box).toBeChecked();
  });

  it('creates a playlist with Enter and adds the video to it', async () => {
    const calls = fakeFetch([
      { method: 'GET', path: LIST, status: 200, body: [] },
      { method: 'POST', path: '/api/playlists', status: 201, body: detail(9, 'Trips', []) },
      { method: 'POST', path: '/api/playlists/9/videos', status: 200, body: detail(9, 'Trips', [VIDEO]) },
    ]);
    renderButton();
    const { user, dialog } = await openPopover();

    await user.type(within(dialog).getByLabelText('New playlist name'), 'Trips{Enter}');

    expect(await within(dialog).findByRole('checkbox', { name: 'Trips' })).toBeChecked();
    expect(await screen.findByText('Saved to Trips')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([
      '/api/playlists',
      '/api/playlists/9/videos',
    ]);
    expect(within(dialog).getByLabelText('New playlist name')).toHaveValue('');
  });

  it('shows the error and restores the checkbox when saving fails', async () => {
    fakeFetch([
      { method: 'GET', path: LIST, status: 200, body: [summary(1, 'VLOG', 0, { containsVideo: false })] },
      {
        method: 'POST',
        path: '/api/playlists/1/videos',
        status: 409,
        body: problem(409, 'VIDEO_HAS_NO_VIETSUB', 'Video has no Vietsub'),
      },
    ]);
    renderButton();
    const { user, dialog } = await openPopover();

    await user.click(within(dialog).getByRole('checkbox', { name: 'VLOG' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Only videos with Vietsub can be added to a playlist.',
    );
    expect(within(dialog).getByRole('checkbox', { name: 'VLOG' })).not.toBeChecked();
  });

  it('says so when there are no playlists yet', async () => {
    fakeFetch([{ method: 'GET', path: LIST, status: 200, body: [] }]);
    renderButton();

    const { dialog } = await openPopover();

    expect(within(dialog).getByText('No playlists yet.')).toBeInTheDocument();
  });
});
