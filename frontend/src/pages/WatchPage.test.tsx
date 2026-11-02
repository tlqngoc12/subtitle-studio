import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViCue, VideoDto } from '../api/client';
import { fakeFetch, problem } from '../test/fakeFetch';
import WatchPage from './WatchPage';

const player = vi.hoisted(() => ({
  currentMs: 0,
  state: 'ready' as 'loading' | 'ready' | 'playing' | 'paused' | 'ended',
  error: null as 'EMBED_BLOCKED' | 'LOAD_FAILED' | null,
}));

vi.mock('../player/useYouTubePlayer', () => ({
  useYouTubePlayer: () => player,
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
    expect(screen.getByRole('link', { name: /Danh sách Vietsub/ })).toHaveAttribute('href', '/vietsub/list');
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

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Toàn màn hình' }));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(requestFullscreen.mock.contexts[0]).toHaveClass('player');
  });

  it('puts the fullscreen button inside the player frame, like YouTube', async () => {
    renderPage();

    const button = await screen.findByRole('button', { name: 'Toàn màn hình' });
    expect(button.closest('.player')).not.toBeNull();
  });

  it('exits fullscreen with the same button', async () => {
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    (document as { exitFullscreen?: unknown }).exitFullscreen = exitFullscreen;
    renderPage();
    const frame = (await screen.findByRole('button', { name: 'Toàn màn hình' })).closest('.player')!;

    act(() => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => frame });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thoát toàn màn hình' }));

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('toggles fullscreen with the F key but not with Ctrl+F', async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen = requestFullscreen;
    renderPage();
    await screen.findByRole('button', { name: 'Toàn màn hình' });

    const user = userEvent.setup();
    await user.keyboard('{Control>}f{/Control}');
    expect(requestFullscreen).not.toHaveBeenCalled();

    await user.keyboard('f');
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });

  it('explains when embedding is blocked', async () => {
    player.error = 'EMBED_BLOCKED';
    renderPage();

    expect(await screen.findByText('Video này không cho phép phát nhúng trong app.')).toBeInTheDocument();
  });

  it('explains when the player cannot load', async () => {
    player.error = 'LOAD_FAILED';
    renderPage();

    expect(await screen.findByText(/Không tải được trình phát YouTube/)).toBeInTheDocument();
  });

  it('says when the video has no Vietsub', async () => {
    renderPage({ ...video, viCueCount: 0, viUpdatedAt: null }, []);

    expect(await screen.findByText('Video này chưa có Vietsub.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Thêm Vietsub/ })).toHaveAttribute('href', '/vietsub');
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

    expect(await screen.findByRole('alert')).toHaveTextContent('Video này không còn trong danh sách');
  });
});
