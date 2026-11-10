import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViCue, VideoDto } from '../api/client';
import { fakeFetch, problem, type Route as FakeRoute } from '../test/fakeFetch';
import { detail, vsVideo } from '../test/playlistFixtures';
import WatchPage from './WatchPage';
import { SiteProvider } from '../data/SiteContext';
import { fakeSource, publicSite } from '../test/fakeSource';

const player = vi.hoisted(() => ({
  currentMs: 0,
  state: 'ready' as 'loading' | 'ready' | 'playing' | 'paused' | 'ended',
  error: null as 'EMBED_BLOCKED' | 'LOAD_FAILED' | null,
  /** Reports 'ended' only for this video, like a real player that starts fresh on the next one. */
  endedFor: null as string | null,
  calls: [] as { videoId: string; autoplay: boolean | undefined }[],
}));

vi.mock('../player/useYouTubePlayer', () => ({
  useYouTubePlayer: (_container: unknown, videoId: string, options?: { autoplay?: boolean }) => {
    player.calls.push({ videoId, autoplay: options?.autoplay });
    return { ...player, state: player.endedFor === videoId ? 'ended' : player.state };
  },
}));

const ID = 'dQw4w9WgXcQ';

const video: VideoDto = {
  id: ID,
  title: 'Học Spring Boot',
  channel: 'Dev Channel',
  durationSec: 754,
  subLang: 'en',
  subSource: 'MANUAL',
  cueCount: 10,
  fetchedAt: '2026-11-02T09:00:00Z',
  thumbnailUrl: `https://i.ytimg.com/vi/${ID}/mqdefault.jpg`,
  viCueCount: 3,
  viUpdatedAt: '2026-11-02T11:00:00Z',
  viSource: 'MANUAL',
  translationStatus: null,
  translationError: null,
  translationProfile: null,
  translationModel: null,
  editStatus: null,
};

const cues: ViCue[] = [
  { startMs: 0, endMs: 1_000, text: 'Xin chào' },
  { startMs: 1_000, endMs: 2_000, text: 'Tạm biệt' },
  { startMs: 3_000, endMs: 4_000, text: 'Hẹn gặp lại' },
];

function renderPage(videoBody: VideoDto = video, cueBody: ViCue[] = cues) {
  fakeFetch([
    { method: 'GET', path: `/api/videos/${ID}`, status: 200, body: videoBody },
    { method: 'GET', path: `/api/videos/${ID}/vietsub`, status: 200, body: cueBody },
  ]);
  return render(
    <MemoryRouter initialEntries={[`/vietsub/${ID}`]}>
      <Routes>
        <Route path="/vietsub/:id" element={<WatchPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('WatchPage', () => {
  beforeEach(() => {
    player.currentMs = 0;
    player.state = 'ready';
    player.error = null;
    player.endedFor = null;
    player.calls = [];
    localStorage.clear();
  });

  afterEach(() => {
    // jsdom has no Fullscreen API; tests that need it install a mock.
    delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen;
    delete (document as { exitFullscreen?: unknown }).exitFullscreen;
    delete (document as { fullscreenElement?: unknown }).fullscreenElement;
  });

  it('shows the video title and a link back to the Vietsub list', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Học Spring Boot' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Vietsub list' })).toHaveAttribute('href', '/vietsub/list');
  });

  it('shows the subtitle for the current time', async () => {
    player.currentMs = 1_500;
    renderPage();

    expect(await screen.findByText('Tạm biệt')).toBeInTheDocument();
    expect(screen.queryByText('Xin chào')).not.toBeInTheDocument();
  });

  it('shows no subtitle in a gap between cues', async () => {
    player.currentMs = 2_500;
    renderPage();

    await screen.findByRole('heading', { name: 'Học Spring Boot' });
    for (const c of cues) expect(screen.queryByText(c.text)).not.toBeInTheDocument();
  });

  it('enters fullscreen on the player frame', async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen = requestFullscreen;
    renderPage();

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Full screen' }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(requestFullscreen.mock.contexts[0]).toHaveClass('player');
  });

  it('puts the fullscreen button inside the player frame, like YouTube', async () => {
    renderPage();

    const button = await screen.findByRole('button', { name: 'Full screen' });
    expect(button.closest('.player')).not.toBeNull();
  });

  it('exits fullscreen with the same button', async () => {
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    (document as { exitFullscreen?: unknown }).exitFullscreen = exitFullscreen;
    renderPage();
    const frame = (await screen.findByRole('button', { name: 'Full screen' })).closest('.player')!;

    act(() => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => frame });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Exit full screen' }));

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('toggles fullscreen with the F key but not with Ctrl+F', async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen = requestFullscreen;
    renderPage();
    await screen.findByRole('button', { name: 'Full screen' });

    const user = userEvent.setup();
    await user.keyboard('{Control>}f{/Control}');
    expect(requestFullscreen).not.toHaveBeenCalled();

    await user.keyboard('f');
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('fills the screen when the browser has no Fullscreen API (iPhone)', async () => {
    renderPage();
    const frame = (await screen.findByRole('button', { name: 'Full screen' })).closest('.player')!;

    await userEvent.setup().click(screen.getByRole('button', { name: 'Full screen' }));

    expect(frame).toHaveClass('player--filled');
    expect(document.documentElement).toHaveClass('player-filled-open');
    expect(screen.getByRole('button', { name: 'Exit full screen' })).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Exit full screen' }));

    expect(frame).not.toHaveClass('player--filled');
    expect(document.documentElement).not.toHaveClass('player-filled-open');
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeInTheDocument();
  });

  it('leaves the filled screen with Escape', async () => {
    renderPage();
    const button = await screen.findByRole('button', { name: 'Full screen' });
    const frame = button.closest('.player')!;
    const user = userEvent.setup();
    await user.click(button);

    await user.keyboard('{Escape}');

    expect(frame).not.toHaveClass('player--filled');
  });

  it('uses webkitRequestFullscreen when that is all the browser has', async () => {
    const webkitRequestFullscreen = vi.fn();
    (HTMLElement.prototype as { webkitRequestFullscreen?: unknown }).webkitRequestFullscreen = webkitRequestFullscreen;
    try {
      renderPage();

      await userEvent.setup().click(await screen.findByRole('button', { name: 'Full screen' }));

      expect(webkitRequestFullscreen).toHaveBeenCalledTimes(1);
      expect(webkitRequestFullscreen.mock.contexts[0]).not.toHaveClass('player--filled');
    } finally {
      delete (HTMLElement.prototype as { webkitRequestFullscreen?: unknown }).webkitRequestFullscreen;
    }
  });

  it('explains when embedding is blocked', async () => {
    player.error = 'EMBED_BLOCKED';
    renderPage();

    expect(await screen.findByText('This video cannot be played in an embedded player.')).toBeInTheDocument();
  });

  it('explains when the player cannot load', async () => {
    player.error = 'LOAD_FAILED';
    renderPage();

    expect(await screen.findByText(/Could not load the YouTube player/)).toBeInTheDocument();
  });

  it('says when the video has no Vietsub', async () => {
    renderPage({ ...video, viCueCount: 0, viUpdatedAt: null }, []);

    expect(await screen.findByText('This video has no Vietsub yet.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Add Vietsub/ })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Add Vietsub');
  });

  it('shows not found for an unknown video', async () => {
    fakeFetch([
      { method: 'GET', path: `/api/videos/${ID}`, status: 404, body: problem(404, 'VIDEO_NOT_FOUND', 'Video not found') },
      { method: 'GET', path: `/api/videos/${ID}/vietsub`, status: 404, body: problem(404, 'VIDEO_NOT_FOUND', 'Video not found') },
    ]);
    render(
      <MemoryRouter initialEntries={[`/vietsub/${ID}`]}>
        <Routes>
          <Route path="/vietsub/:id" element={<WatchPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('This video is no longer in the list');
  });

  describe('playlist mode', () => {
    const A = vsVideo('aaaaaaaaaaa', 'Alpha');
    const B = vsVideo('bbbbbbbbbbb', 'Bravo');
    const C = vsVideo('ccccccccccc', 'Charlie');
    const PL = detail(4, 'VLOG OF US', [A, B, C]);

    function Location() {
      const { pathname, search } = useLocation();
      return <output aria-label="location">{pathname + search}</output>;
    }

    function renderAt(entry: string, playlistRoute: FakeRoute = { method: 'GET', path: '/api/playlists/4', status: 200, body: PL }) {
      fakeFetch([
        playlistRoute,
        ...[A, B, C].flatMap((v): FakeRoute[] => [
          { method: 'GET', path: `/api/videos/${v.id}`, status: 200, body: v },
          { method: 'GET', path: `/api/videos/${v.id}/vietsub`, status: 200, body: cues },
        ]),
      ]);
      // A new element each time: re-rendering the same element object would be skipped by React.
      const tree = () => (
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/vietsub/:id" element={<><WatchPage /><Location /></>} />
          </Routes>
        </MemoryRouter>
      );
      const result = render(tree());
      return { rerender: () => result.rerender(tree()) };
    }

    const location = () => screen.getByLabelText('location').textContent;
    const panel = () => screen.findByRole('complementary', { name: 'Playlist VLOG OF US' });

    it('has no playlist panel without ?playlist', async () => {
      renderAt(`/vietsub/${A.id}`);

      await screen.findByRole('heading', { name: 'Alpha' });
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });

    it('shows the playlist panel in playlist mode', async () => {
      renderAt(`/vietsub/${B.id}?playlist=4`);

      expect(within(await panel()).getByText('2 / 3')).toBeInTheDocument();
    });

    it('goes to the next and previous video, keeping the playlist and autoplaying', async () => {
      renderAt(`/vietsub/${B.id}?playlist=4`);
      const user = userEvent.setup();

      await user.click(within(await panel()).getByRole('button', { name: 'Next video' }));
      expect(location()).toBe(`/vietsub/${C.id}?playlist=4`);
      expect(await screen.findByRole('heading', { name: 'Charlie' })).toBeInTheDocument();
      expect(player.calls.at(-1)).toEqual({ videoId: C.id, autoplay: true });

      await user.click(within(await panel()).getByRole('button', { name: 'Previous video' }));
      expect(location()).toBe(`/vietsub/${B.id}?playlist=4`);
    });

    it('does not start the first video of a playlist on its own', async () => {
      renderAt(`/vietsub/${A.id}?playlist=4`);
      await panel();

      expect(player.calls.at(-1)).toEqual({ videoId: A.id, autoplay: false });
    });

    it('plays the next video when one ends and Autoplay is on', async () => {
      const { rerender } = renderAt(`/vietsub/${A.id}?playlist=4`);
      await panel();

      player.endedFor = A.id;
      act(() => rerender());

      await waitFor(() => expect(location()).toBe(`/vietsub/${B.id}?playlist=4`));
      expect(player.calls.at(-1)).toEqual({ videoId: B.id, autoplay: true });
    });

    it('stays when a video ends and Autoplay is off', async () => {
      const { rerender } = renderAt(`/vietsub/${A.id}?playlist=4`);
      await userEvent.setup().click(within(await panel()).getByRole('switch', { name: 'Autoplay' }));

      player.endedFor = A.id;
      act(() => rerender());

      await act(async () => {});
      expect(location()).toBe(`/vietsub/${A.id}?playlist=4`);
    });

    it('stops at the end of the playlist', async () => {
      const { rerender } = renderAt(`/vietsub/${C.id}?playlist=4`);
      await panel();

      player.endedFor = C.id;
      act(() => rerender());

      expect(await screen.findByText('End of playlist')).toBeInTheDocument();
      expect(location()).toBe(`/vietsub/${C.id}?playlist=4`);
    });

    it('goes next with Shift+N and back with Shift+P, but not while typing', async () => {
      renderAt(`/vietsub/${B.id}?playlist=4`);
      await panel();
      const user = userEvent.setup();

      await user.keyboard('{Shift>}N{/Shift}');
      expect(location()).toBe(`/vietsub/${C.id}?playlist=4`);
      await user.keyboard('{Shift>}P{/Shift}');
      expect(location()).toBe(`/vietsub/${B.id}?playlist=4`);

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      await user.keyboard('{Shift>}N{/Shift}');
      expect(location()).toBe(`/vietsub/${B.id}?playlist=4`);
      input.remove();
    });

    it('shows the normal page when the playlist does not exist', async () => {
      renderAt(`/vietsub/${A.id}?playlist=4`, {
        method: 'GET',
        path: '/api/playlists/4',
        status: 404,
        body: problem(404, 'PLAYLIST_NOT_FOUND', 'gone'),
      });

      await screen.findByRole('heading', { name: 'Alpha' });
      await act(async () => {});
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows the normal page when the video is not in the playlist', async () => {
      renderAt(`/vietsub/${A.id}?playlist=4`, {
        method: 'GET',
        path: '/api/playlists/4',
        status: 200,
        body: detail(4, 'VLOG OF US', [B, C]),
      });

      await screen.findByRole('heading', { name: 'Alpha' });
      await act(async () => {});
      expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    });

    it('remembers the Autoplay choice', async () => {
      renderAt(`/vietsub/${A.id}?playlist=4`);
      await userEvent.setup().click(within(await panel()).getByRole('switch', { name: 'Autoplay' }));
      cleanup();

      renderAt(`/vietsub/${B.id}?playlist=4`);

      expect(within(await panel()).getByRole('switch', { name: 'Autoplay' })).not.toBeChecked();
    });
  });
});

describe('WatchPage on the public site', () => {
  function renderPublic(source: Parameters<typeof publicSite>[0]) {
    return render(
      <SiteProvider value={publicSite(source)}>
        <MemoryRouter initialEntries={[`/vietsub/${ID}`]}>
          <Routes>
            <Route path="/vietsub/:id" element={<WatchPage />} />
          </Routes>
        </MemoryRouter>
      </SiteProvider>,
    );
  }

  it('usesTheSiteSource', async () => {
    renderPublic(fakeSource({ getVideo: async () => video, getVietsub: async () => cues }));

    expect(await screen.findByRole('heading', { name: video.title })).toBeInTheDocument();
  });

  it('readOnlyEmptyStateHasNoAddLink', async () => {
    renderPublic(fakeSource({ getVideo: async () => ({ ...video, viCueCount: 0 }), getVietsub: async () => [] }));

    expect(await screen.findByText(/This video has no Vietsub yet\./)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add Vietsub' })).not.toBeInTheDocument();
  });
});
