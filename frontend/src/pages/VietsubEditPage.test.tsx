import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViCue, VideoDto } from '../api/client';
import { SCROLL_RESUME_MS } from '../components/vietsub/CueEditorTable';
import { fakeFetch, problem } from '../test/fakeFetch';
import VietsubEditPage from './VietsubEditPage';

const player = vi.hoisted(() => ({
  currentMs: 0,
  state: 'ready' as 'loading' | 'ready' | 'playing' | 'paused' | 'ended',
  error: null as 'EMBED_BLOCKED' | 'LOAD_FAILED' | null,
  seekTo: vi.fn(),
}));

vi.mock('../player/useYouTubePlayer', () => ({
  useYouTubePlayer: () => ({ ...player }),
}));

// Every row formats its two times when it renders, so the number of calls counts row renders.
const format = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../lib/format', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/format')>();
  return {
    ...original,
    formatTimecode: (ms: number) => {
      format.calls++;
      return original.formatTimecode(ms);
    },
  };
});

const polling = vi.hoisted(() => ({
  ids: [] as string[],
  onUpdate: null as null | ((v: unknown) => void),
}));
vi.mock('../lib/useTranslationPolling', () => ({
  useTranslationPolling: (ids: string[], onUpdate: (v: unknown) => void) => {
    polling.ids = ids;
    polling.onUpdate = onUpdate;
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
  viSource: 'AUTO',
  translationStatus: null,
  translationError: null,
  translationProfile: null,
  translationModel: null,
};

const cues: ViCue[] = [
  { startMs: 0, endMs: 1_000, text: 'Xin chào' },
  { startMs: 1_000, endMs: 2_000, text: 'Tạm biệt' },
  { startMs: 3_000, endMs: 4_500, text: 'Hẹn gặp lại' },
];

function routes(v: VideoDto = video, lines: ViCue[] = cues) {
  return [
    { method: 'GET', path: `/api/videos/${ID}`, status: 200, body: v },
    { method: 'GET', path: `/api/videos/${ID}/vietsub`, status: 200, body: lines },
  ];
}

function tree(): ReactElement {
  return (
    <MemoryRouter initialEntries={[`/vietsub/${ID}/edit`]}>
      <Routes>
        <Route path="/vietsub/:id/edit" element={<VietsubEditPage />} />
      </Routes>
    </MemoryRouter>
  );
}

async function renderEditor(v: VideoDto = video, lines: ViCue[] = cues) {
  fakeFetch(routes(v, lines));
  const view = render(tree());
  await screen.findByRole('table');
  return view;
}

/** The subtitle on the video: text nodes outside the textareas. */
const overlay = { ignore: 'textarea' };
const area = (n: number) => screen.getByRole('textbox', { name: `Line ${n} text` });
const row = (n: number) => area(n).closest('tr') as HTMLElement;

describe('VietsubEditPage', () => {
  beforeEach(() => {
    player.currentMs = 0;
    player.state = 'ready';
    player.error = null;
    player.seekTo = vi.fn();
    polling.ids = [];
    polling.onUpdate = null;
    format.calls = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('shows a loading line, then the video title, breadcrumb and source badge', async () => {
    fakeFetch(routes());
    render(tree());

    expect(screen.getByRole('status')).toHaveTextContent('Loading Vietsub…');
    expect(await screen.findByRole('heading', { level: 1, name: 'Học Spring Boot' })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Vietsub' })).toHaveAttribute('href', '/vietsub/list');
    expect(within(crumbs).getByRole('link', { name: 'Manage Vietsub' })).toHaveAttribute('href', '/vietsub');
    expect(within(crumbs).getByText('Học Spring Boot')).toBeInTheDocument();
    expect(screen.getByText('AI', { exact: true })).toBeInTheDocument();
  });

  it('shows Manual for an uploaded Vietsub', async () => {
    await renderEditor({ ...video, viSource: 'MANUAL' });

    expect(screen.getByText('Manual', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('AI', { exact: true })).not.toBeInTheDocument();
  });

  it('renders one row per line with read-only times and a labelled textarea', async () => {
    await renderEditor();

    const table = screen.getByRole('table', { name: 'Vietsub lines' });
    expect(within(table).getAllByRole('row')).toHaveLength(4); // header + 3
    expect(area(1)).toHaveValue('Xin chào');
    expect(area(3)).toHaveValue('Hẹn gặp lại');
    expect(within(row(3)).getByText('00:00:03,000')).toBeInTheDocument();
    expect(within(row(3)).getByText('00:00:04,500')).toBeInTheDocument();
    expect(within(row(3)).getByRole('button', { name: 'Go to line 3' })).toHaveTextContent('3');
  });

  it('highlights the line on screen with aria-current and follows the player time', async () => {
    player.currentMs = 1_500;
    const { rerender } = await renderEditor();

    expect(row(2)).toHaveAttribute('aria-current', 'true');
    expect(row(1)).not.toHaveAttribute('aria-current');
    expect(row(3)).not.toHaveAttribute('aria-current');

    player.currentMs = 3_200;
    rerender(tree());
    expect(row(3)).toHaveAttribute('aria-current', 'true');
    expect(row(2)).not.toHaveAttribute('aria-current');

    player.currentMs = 2_500; // a gap between lines
    rerender(tree());
    expect(screen.queryAllByRole('row').filter((r) => r.getAttribute('aria-current'))).toHaveLength(0);
  });

  it('shows the saved text on the video, and the edited text as soon as it is typed', async () => {
    player.currentMs = 1_500;
    await renderEditor();
    expect(screen.getByText('Tạm biệt', overlay)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.clear(area(2));
    await user.type(area(2), 'Chưa lưu');

    expect(screen.getByText('Chưa lưu', overlay)).toBeInTheDocument();
    expect(screen.queryByText('Tạm biệt', overlay)).not.toBeInTheDocument();
  });

  it('seeks the video to the start of a line from its number button', async () => {
    await renderEditor();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Go to line 3' }));

    expect(player.seekTo).toHaveBeenCalledWith(3_000);
  });

  it('marks edited rows with a dot and removes it when the text is restored', async () => {
    await renderEditor();
    const user = userEvent.setup();
    expect(screen.queryByRole('img', { name: 'Edited' })).not.toBeInTheDocument();

    await user.type(area(2), '!');
    expect(within(row(2)).getByRole('img', { name: 'Edited' })).toBeInTheDocument();
    expect(within(row(1)).queryByRole('img', { name: 'Edited' })).not.toBeInTheDocument();

    await user.type(area(2), '{Backspace}');
    expect(screen.queryByRole('img', { name: 'Edited' })).not.toBeInTheDocument();
  });

  it('typing never controls the player: Space, f and the arrow keys only edit the text', async () => {
    await renderEditor();
    const user = userEvent.setup();

    await user.click(area(1));
    await user.keyboard(' f{ArrowLeft}{ArrowRight}');

    expect(area(1)).toHaveValue('Xin chào f');
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeInTheDocument(); // f did not toggle it
  });

  it('re-renders only the edited row while typing', async () => {
    const lines = Array.from({ length: 50 }, (_, i) => ({ startMs: i * 1000, endMs: i * 1000 + 900, text: `Dòng ${i}` }));
    await renderEditor({ ...video, viCueCount: 50 }, lines);
    const user = userEvent.setup();
    await user.click(area(10));
    format.calls = 0;

    await user.keyboard('abc');

    // 3 keystrokes x 1 row x 2 times per row; a full-table render would be 50 x 2 per keystroke.
    expect(format.calls).toBe(6);
  });

  describe('auto-scroll', () => {
    it('scrolls the highlighted line into view when it changes', async () => {
      const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
      player.currentMs = 0;
      const { rerender } = await renderEditor();
      spy.mockClear();

      player.currentMs = 3_200;
      rerender(tree());

      await waitFor(() => expect(spy).toHaveBeenCalled());
      expect(spy.mock.contexts.at(-1)).toBe(row(3));
    });

    it('does not move the table while a textarea has focus, and follows again 3 s after it loses focus', async () => {
      const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
      const { rerender } = await renderEditor();
      await act(async () => area(1).focus());
      spy.mockClear();

      player.currentMs = 3_200;
      rerender(tree());
      expect(spy).not.toHaveBeenCalled();

      vi.useFakeTimers();
      act(() => area(1).blur());
      act(() => {
        vi.advanceTimersByTime(SCROLL_RESUME_MS - 100);
      });
      expect(spy).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.contexts.at(-1)).toBe(row(3));
    });
  });

  it('shows a not-found alert with a link back when the video is gone', async () => {
    fakeFetch([{ method: 'GET', path: `/api/videos/${ID}`, status: 404, body: problem(404, 'VIDEO_NOT_FOUND', 'x') }]);
    render(tree());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This video is no longer in the list.');
    expect(within(alert).getByRole('link', { name: 'Back to Manage Vietsub' })).toHaveAttribute('href', '/vietsub');
  });

  it('shows an alert, not the editor, when the video has no Vietsub', async () => {
    fakeFetch(routes({ ...video, viCueCount: 0, viSource: null, viUpdatedAt: null }, []));
    render(tree());

    expect(await screen.findByRole('alert')).toHaveTextContent('This video has no Vietsub yet.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('is read-only while Gemini translates, and becomes editable when it finishes', async () => {
    const translating: VideoDto = { ...video, translationStatus: 'TRANSLATING' };
    const calls = fakeFetch(routes(translating));
    render(tree());
    await screen.findByRole('table');

    expect(screen.getByText('Gemini is translating this video. Editing is available when it finishes.')).toBeInTheDocument();
    expect(area(1)).toHaveAttribute('readonly');
    expect(polling.ids).toEqual([ID]);

    fakeFetch(routes({ ...video, translationStatus: null }));
    act(() => polling.onUpdate!({ ...video, translationStatus: null }));

    await waitFor(() => expect(area(1)).not.toHaveAttribute('readonly'));
    expect(screen.queryByText(/Gemini is translating/)).not.toBeInTheDocument();
    expect(calls.length).toBeGreaterThan(0);
  });
});
