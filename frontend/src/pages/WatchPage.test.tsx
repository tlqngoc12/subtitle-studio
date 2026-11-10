import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViCue, VideoDto } from '../api/client';
import { fakeFetch, problem, type Route as FakeRoute } from '../test/fakeFetch';
import { detail, vsVideo } from '../test/playlistFixtures';
import WatchPage from './WatchPage';
import { resetWatched } from '../data/watched';
import { resetViewerPrefs } from '../lib/viewerPrefs';
import { SiteProvider } from '../data/SiteContext';
import { fakeSource, publicSite } from '../test/fakeSource';

const player = vi.hoisted(() => ({
  currentMs: 0,
  state: 'ready' as 'loading' | 'ready' | 'playing' | 'paused' | 'ended',
  error: null as 'EMBED_BLOCKED' | 'LOAD_FAILED' | null,
  /** Reports 'ended' only for this video, like a real player that starts fresh on the next one. */
  endedFor: null as string | null,
  calls: [] as { videoId: string; autoplay: boolean | undefined }[],
  togglePlay: vi.fn(),
  seekBy: vi.fn(),
  toggleMute: vi.fn(),
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
    player.togglePlay.mockClear();
    player.seekBy.mockClear();
    player.toggleMute.mockClear();
    localStorage.clear();
    resetWatched();
    resetViewerPrefs();
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

  describe('layout', () => {
    it('puts the title under the video, so the video is the first thing on the page', async () => {
      renderPage();

      const heading = await screen.findByRole('heading', { name: 'Học Spring Boot' });
      const frame = document.querySelector('.player')!;
      expect(frame.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('player shortcuts', () => {
    it('K and Space play or pause, J/L and the arrows seek, M mutes', async () => {
      renderPage();
      await screen.findByRole('heading', { name: 'Học Spring Boot' });
      const user = userEvent.setup();

      await user.keyboard('k');
      await user.keyboard(' ');
      expect(player.togglePlay).toHaveBeenCalledTimes(2);
      await user.keyboard('l');
      expect(player.seekBy).toHaveBeenLastCalledWith(10);
      await user.keyboard('{ArrowLeft}');
      expect(player.seekBy).toHaveBeenLastCalledWith(-5);
      await user.keyboard('m');
      expect(player.toggleMute).toHaveBeenCalledTimes(1);
    });

    it('does not react while typing', async () => {
      renderPage();
      await screen.findByRole('heading', { name: 'Học Spring Boot' });
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      await userEvent.setup().keyboard('klm');

      expect(player.togglePlay).not.toHaveBeenCalled();
      expect(player.toggleMute).not.toHaveBeenCalled();
      input.remove();
    });

    it('lists the shortcuts in a popover, opened by the button or by ?', async () => {
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: 'Keyboard shortcuts' }));
      const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
      expect(within(dialog).getByText('Play / pause')).toBeInTheDocument();
      expect(within(dialog).getByText('Show / hide Vietsub')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await user.keyboard('?');
      expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    });
  });

  describe('Vietsub on/off', () => {
    beforeEach(() => {
      player.currentMs = 1_500;
    });

    it('C hides and shows the Vietsub, and the button reflects it', async () => {
      renderPage();
      expect(await screen.findByText('Tạm biệt')).toBeInTheDocument();
      const user = userEvent.setup();

      await user.keyboard('c');
      expect(screen.queryByText('Tạm biệt')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Show Vietsub' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Show Vietsub' }));
      expect(screen.getByText('Tạm biệt')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Hide Vietsub' })).toBeInTheDocument();
    });

    it('puts the button inside the player frame so it works in fullscreen', async () => {
      renderPage();
      const button = await screen.findByRole('button', { name: 'Hide Vietsub' });
      expect(button.closest('.player')).not.toBeNull();
    });

    it('remembers the choice', async () => {
      renderPage();
      await screen.findByText('Tạm biệt');
      await userEvent.setup().keyboard('c');
      cleanup();

      renderPage();

      expect(await screen.findByRole('button', { name: 'Show Vietsub' })).toBeInTheDocument();
      expect(screen.queryByText('Tạm biệt')).not.toBeInTheDocument();
    });

    it('still works when storage is blocked', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      renderPage();
      expect(await screen.findByText('Tạm biệt')).toBeInTheDocument();

      await userEvent.setup().keyboard('c');

      expect(screen.queryByText('Tạm biệt')).not.toBeInTheDocument();
      vi.restoreAllMocks();
    });
  });

  describe('theater mode', () => {
    const theaterOn = (container: HTMLElement) => container.querySelector('.watch--theater') !== null;

    it('the T key and the button both toggle it, and the button reflects it', async () => {
      const { container } = renderPage();
      const button = await screen.findByRole('button', { name: 'Theater mode' });
      expect(button).toHaveAttribute('aria-pressed', 'false');
      expect(theaterOn(container)).toBe(false);
      const user = userEvent.setup();

      await user.keyboard('t');
      expect(screen.getByRole('button', { name: 'Exit theater mode' })).toHaveAttribute('aria-pressed', 'true');
      expect(theaterOn(container)).toBe(true);

      await user.click(screen.getByRole('button', { name: 'Exit theater mode' }));
      expect(screen.getByRole('button', { name: 'Theater mode' })).toHaveAttribute('aria-pressed', 'false');
      expect(theaterOn(container)).toBe(false);
    });

    it('puts the button inside the player frame so it works in fullscreen', async () => {
      renderPage();
      const button = await screen.findByRole('button', { name: 'Theater mode' });
      expect(button.closest('.player')).not.toBeNull();
    });

    it('remembers the choice after the page is opened again', async () => {
      renderPage();
      await screen.findByRole('button', { name: 'Theater mode' });
      await userEvent.setup().keyboard('t');
      cleanup();

      const { container } = renderPage();

      expect(await screen.findByRole('button', { name: 'Exit theater mode' })).toHaveAttribute('aria-pressed', 'true');
      expect(theaterOn(container)).toBe(true);
      expect(localStorage.getItem('subtitle-studio.theater')).toBe('on');
    });

    it('ignores T while typing in a field', async () => {
      renderPage();
      await screen.findByRole('button', { name: 'Theater mode' });
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      await userEvent.setup().keyboard('t');

      expect(screen.getByRole('button', { name: 'Theater mode' })).toHaveAttribute('aria-pressed', 'false');
      input.remove();
    });

    it('lists the T key in the shortcuts', async () => {
      renderPage();
      await userEvent.setup().click(await screen.findByRole('button', { name: 'Keyboard shortcuts' }));
      const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
      expect(within(dialog).getByText('Theater mode')).toBeInTheDocument();
    });
  });

  describe('caption size', () => {
    beforeEach(() => {
      player.currentMs = 1_500;
    });

    const lineScale = () => screen.getByText('Tạm biệt').parentElement!.style.getPropertyValue('--caption-scale');

    async function openSizes() {
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Keyboard shortcuts' }));
      const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
      return { user, group: within(dialog).getByRole('radiogroup', { name: 'Caption size' }) };
    }

    it('is S (1, the size before this setting) until the viewer chooses', async () => {
      renderPage();
      await screen.findByText('Tạm biệt');
      expect(lineScale()).toBe('1');
      const { group } = await openSizes();
      expect(within(group).getByRole('radio', { name: 'S' })).toBeChecked();
    });

    it('choosing L makes the captions 1.5 times bigger and is remembered', async () => {
      renderPage();
      await screen.findByText('Tạm biệt');
      const { user, group } = await openSizes();

      await user.click(within(group).getByRole('radio', { name: 'L' }));

      expect(within(group).getByRole('radio', { name: 'L' })).toBeChecked();
      expect(lineScale()).toBe('1.5');
      expect(localStorage.getItem('subtitle-studio.captionSize')).toBe('l');
      cleanup();

      renderPage();
      await screen.findByText('Tạm biệt');
      expect(lineScale()).toBe('1.5');
    });

    it('choosing M makes the captions 1.25 times bigger', async () => {
      renderPage();
      await screen.findByText('Tạm biệt');
      const { user, group } = await openSizes();

      await user.click(within(group).getByRole('radio', { name: 'M' }));

      expect(lineScale()).toBe('1.25');
    });
  });

  describe('watched', () => {
    const watchedIds = () => JSON.parse(localStorage.getItem('subtitle-studio.watched') ?? '[]') as string[];

    it('does not mark a video that has only just started', async () => {
      player.currentMs = 5_000;
      renderPage();
      await screen.findByRole('heading', { name: 'Học Spring Boot' });
      expect(watchedIds()).toEqual([]);
    });

    it('marks a video that ended', async () => {
      player.state = 'ended';
      renderPage();
      await screen.findByRole('heading', { name: 'Học Spring Boot' });
      expect(watchedIds()).toEqual([ID]);
    });

    it('marks a video played past 90% of its duration (754 s)', async () => {
      player.currentMs = 700_000;
      renderPage();
      await screen.findByRole('heading', { name: 'Học Spring Boot' });
      expect(watchedIds()).toEqual([ID]);
    });

    it('does not break the page when storage is blocked', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      player.state = 'ended';
      renderPage();
      expect(await screen.findByRole('heading', { name: 'Học Spring Boot' })).toBeInTheDocument();
      vi.restoreAllMocks();
    });
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

    it('shows what plays next', async () => {
      renderAt(`/vietsub/${B.id}?playlist=4`);

      expect(within(await panel()).getByText(/Up next/)).toHaveTextContent('Up next: Charlie');
    });

    it('shows no Up next on the last video', async () => {
      renderAt(`/vietsub/${C.id}?playlist=4`);

      await panel();
      expect(screen.queryByText(/Up next/)).not.toBeInTheDocument();
    });

    it('marks the videos watched before in the panel', async () => {
      localStorage.setItem('subtitle-studio.watched', JSON.stringify([A.id]));
      renderAt(`/vietsub/${B.id}?playlist=4`);

      const links = within(await panel()).getAllByRole('link');
      expect(within(links[0]).getByText('Watched')).toBeInTheDocument();
      expect(within(links[2]).queryByText('Watched')).not.toBeInTheDocument();
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

  it('records a watched video on the public site too', async () => {
    player.state = 'ended';
    renderPublic(fakeSource({ getVideo: async () => video, getVietsub: async () => cues }));

    await screen.findByRole('heading', { name: video.title });
    expect(JSON.parse(localStorage.getItem('subtitle-studio.watched')!)).toEqual([ID]);
  });

  it('has theater mode and the caption size on the public site too', async () => {
    player.currentMs = 1_500;
    renderPublic(fakeSource({ getVideo: async () => video, getVietsub: async () => cues }));

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Theater mode' }));
    expect(screen.getByRole('button', { name: 'Exit theater mode' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(await screen.findByRole('radiogroup', { name: 'Caption size' })).toBeInTheDocument();
  });

  it('readOnlyEmptyStateHasNoAddLink', async () => {
    renderPublic(fakeSource({ getVideo: async () => ({ ...video, viCueCount: 0 }), getVietsub: async () => [] }));

    expect(await screen.findByText(/This video has no Vietsub yet\./)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add Vietsub' })).not.toBeInTheDocument();
  });
});
