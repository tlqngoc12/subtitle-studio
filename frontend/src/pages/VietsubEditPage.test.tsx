import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViCue, VideoDto } from '../api/client';
import { SCROLL_RESUME_MS } from '../components/vietsub/CueEditorTable';
import { answerConfirm } from '../test/confirm';
import { fakeFetch, problem } from '../test/fakeFetch';
import { expectTooltip } from '../test/tooltip';
import VietsubEditPage from './VietsubEditPage';

vi.mock('sonner', async (orig) => ({ ...(await orig<typeof import('sonner')>()), toast: { success: vi.fn(), error: vi.fn() } }));

const player = vi.hoisted(() => ({
  currentMs: 0,
  state: 'ready' as 'loading' | 'ready' | 'playing' | 'paused' | 'ended',
  error: null as 'EMBED_BLOCKED' | 'LOAD_FAILED' | null,
  seekTo: vi.fn(),
  play: vi.fn(),
}));

vi.mock('../player/useYouTubePlayer', () => ({
  useYouTubePlayer: () => ({ ...player }),
}));

// Counts every useRef call (each component render makes some), to prove that typing re-renders one row only.
const refs = vi.hoisted(() => ({ calls: 0 }));
vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>();
  return {
    ...original,
    useRef: ((...args: Parameters<typeof original.useRef>) => {
      refs.calls++;
      return original.useRef(...args);
    }) as typeof original.useRef,
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
  editStatus: null,
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
      <Link to="/away">Away</Link>
      <Routes>
        <Route path="/vietsub/:id/edit" element={<VietsubEditPage />} />
        <Route path="/away" element={<p>away page</p>} />
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
const highlighted = () => screen.queryAllByRole('row').filter((r) => r.getAttribute('aria-current'));

describe('VietsubEditPage', () => {
  beforeEach(() => {
    player.currentMs = 0;
    player.state = 'ready';
    player.error = null;
    player.seekTo = vi.fn();
    player.play = vi.fn();
    polling.ids = [];
    polling.onUpdate = null;
    vi.mocked(toast.success).mockClear();
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

  it('renders one row per line with a seek number and a labelled textarea, and no time columns', async () => {
    await renderEditor();

    const table = screen.getByRole('table', { name: 'Vietsub lines' });
    expect(within(table).getAllByRole('row')).toHaveLength(4); // header + 3
    expect(area(1)).toHaveValue('Xin chào');
    expect(area(3)).toHaveValue('Hẹn gặp lại');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['#', 'Text']);
    expect(within(row(3)).queryByText('00:00:03,000')).not.toBeInTheDocument();
    expect(within(row(3)).queryByText('00:00:04,500')).not.toBeInTheDocument();
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

    player.currentMs = 2_500; // a gap between lines: the line before it stays highlighted
    rerender(tree());
    expect(row(2)).toHaveAttribute('aria-current', 'true');
    expect(highlighted()).toHaveLength(1);

    player.currentMs = 4_800; // after the last line
    rerender(tree());
    expect(row(3)).toHaveAttribute('aria-current', 'true');
    expect(highlighted()).toHaveLength(1);
  });

  it('highlights the first line when the time is before every line', async () => {
    player.currentMs = 3_200;
    const lines: ViCue[] = [
      { startMs: 5_000, endMs: 6_000, text: 'A' },
      { startMs: 7_000, endMs: 8_000, text: 'B' },
    ];
    fakeFetch(routes({ ...video, viCueCount: 2 }, lines));
    render(tree());
    await screen.findByRole('table');

    expect(row(1)).toHaveAttribute('aria-current', 'true');
    expect(highlighted()).toHaveLength(1);
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
    expect(player.seekTo).toHaveBeenCalledTimes(1); // only the click that focused line 1; the keys did nothing
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeInTheDocument(); // f did not toggle it
  });

  it('re-renders only the edited row while typing', async () => {
    async function typingCost(count: number) {
      const lines = Array.from({ length: count }, (_, i) => ({ startMs: i * 1000, endMs: i * 1000 + 900, text: `Dòng ${i}` }));
      const { unmount } = await renderEditor({ ...video, viCueCount: count }, lines);
      const user = userEvent.setup();
      await user.click(area(2));
      refs.calls = 0;
      await user.keyboard('abc');
      const cost = refs.calls;
      unmount();
      return cost;
    }

    const small = await typingCost(3);
    const large = await typingCost(50);

    // A full-table render per keystroke would add 47 rows' worth of renders.
    expect(large).toBe(small);
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

      player.currentMs = 1_200; // normal playback into line 2
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
      expect(spy.mock.contexts.at(-1)).toBe(row(2));
    });

    // Lines: 1 = 0-1 s, 2 = 1-2 s, 3 = 3-4.5 s; 2-3 s is a gap.
    it('seeking backwards into a gap scrolls to and highlights the line before it, without moving focus', async () => {
      const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
      player.currentMs = 3_200;
      const { rerender } = await renderEditor();
      spy.mockClear();
      const before = document.activeElement;

      player.currentMs = 2_500;
      rerender(tree());

      await waitFor(() => expect(spy).toHaveBeenCalled());
      expect(spy.mock.contexts.at(-1)).toBe(row(2));
      expect(row(2)).toHaveAttribute('aria-current', 'true');
      expect(highlighted()).toHaveLength(1);
      expect(document.activeElement).toBe(before);
      expect(document.activeElement).not.toBeInstanceOf(HTMLTextAreaElement);
    });

    it('seeking forwards into a gap scrolls to and highlights the line before it, without moving focus', async () => {
      const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
      player.currentMs = 100;
      const { rerender } = await renderEditor();
      spy.mockClear();
      const before = document.activeElement;

      player.currentMs = 2_500;
      rerender(tree());

      await waitFor(() => expect(spy).toHaveBeenCalled());
      expect(spy.mock.contexts.at(-1)).toBe(row(2));
      expect(row(2)).toHaveAttribute('aria-current', 'true');
      expect(highlighted()).toHaveLength(1);
      expect(document.activeElement).toBe(before);
    });

    it('a seek into a line scrolls to and highlights it, without focusing or placing a caret', async () => {
      const focus = vi.spyOn(HTMLElement.prototype, 'focus');
      const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
      player.currentMs = 3_200;
      const { rerender } = await renderEditor();
      spy.mockClear();
      const before = document.activeElement;

      player.currentMs = 1_300; // backwards into line 2
      rerender(tree());

      await waitFor(() => expect(spy).toHaveBeenCalled());
      expect(spy.mock.contexts.at(-1)).toBe(row(2));
      expect(row(2)).toHaveAttribute('aria-current', 'true');
      expect(highlighted()).toHaveLength(1);
      expect(focus).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(before);
    });

    it('a seek while a textarea has focus scrolls and highlights, and focus stays in that textarea', async () => {
      const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
      player.currentMs = 3_200;
      const { rerender } = await renderEditor();
      await act(async () => area(3).focus());
      spy.mockClear();

      player.currentMs = 500;
      rerender(tree());

      await waitFor(() => expect(spy).toHaveBeenCalled());
      expect(spy.mock.contexts.at(-1)).toBe(row(1));
      expect(row(1)).toHaveAttribute('aria-current', 'true');
      expect(highlighted()).toHaveLength(1);
      expect(area(3)).toHaveFocus();
    });

    it('normal playback highlights the next line but never moves focus', async () => {
      const { rerender } = await renderEditor();
      await act(async () => area(1).focus());

      player.currentMs = 1_200;
      rerender(tree());

      expect(row(2)).toHaveAttribute('aria-current', 'true');
      expect(area(1)).toHaveFocus();

      await act(async () => area(1).blur());
      player.currentMs = 1_900;
      rerender(tree());
      expect(document.body).toHaveFocus();
    });

    it('the # button seeks and scrolls to the row at once, without focusing its textarea', async () => {
      const user = userEvent.setup();
      const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
      await renderEditor();
      await act(async () => area(1).focus());
      spy.mockClear();

      await user.click(within(row(3)).getByRole('button', { name: 'Go to line 3' }));

      expect(player.seekTo).toHaveBeenCalledWith(3_000);
      expect(spy.mock.contexts).toContain(row(3)); // the mocked player keeps its time, so the highlight may scroll back
      expect(area(3)).not.toHaveFocus();
      expect(document.activeElement).not.toBeInstanceOf(HTMLTextAreaElement); // only the clicked button has focus
    });

    it('the # button without a focused textarea focuses no textarea', async () => {
      const user = userEvent.setup();
      await renderEditor();

      await user.click(within(row(3)).getByRole('button', { name: 'Go to line 3' }));

      expect(document.activeElement).not.toBeInstanceOf(HTMLTextAreaElement);
    });

    it('typing in a textarea does not control the player beyond the focus seek, and Space types a space', async () => {
      const user = userEvent.setup();
      await renderEditor();
      await user.click(area(1));
      await user.keyboard(' ');

      expect(player.seekTo).toHaveBeenCalledTimes(1); // only the focus seek of line 1
      expect(area(1)).toHaveValue('Xin chào ');
    });

    it('scrolls to the first line when the time is before every line', async () => {
      const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
      player.currentMs = 3_200;
      const lines: ViCue[] = [
        { startMs: 5_000, endMs: 6_000, text: 'A' },
        { startMs: 7_000, endMs: 8_000, text: 'B' },
      ];
      fakeFetch(routes({ ...video, viCueCount: 2 }, lines));
      const { rerender } = render(tree());
      await screen.findByRole('table');
      player.currentMs = 7_500;
      rerender(tree());
      await waitFor(() => expect(spy.mock.contexts.at(-1)).toBe(row(2)));
      spy.mockClear();

      player.currentMs = 1_000;
      rerender(tree());

      await waitFor(() => expect(spy).toHaveBeenCalled());
      expect(spy.mock.contexts.at(-1)).toBe(row(1));
    });

    it('follows a seek at once during the 3 s hold after a textarea loses focus', async () => {
      const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
      player.currentMs = 3_200;
      const { rerender } = await renderEditor();
      await act(async () => area(3).focus());
      vi.useFakeTimers();
      act(() => area(3).blur()); // e.g. a click into the YouTube iframe
      spy.mockClear();

      player.currentMs = 500;
      rerender(tree());

      expect(spy).toHaveBeenCalled();
      expect(spy.mock.contexts.at(-1)).toBe(row(1));
    });

    it('keeps holding through normal playback after a blur', async () => {
      const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
      player.currentMs = 500;
      const { rerender } = await renderEditor();
      await act(async () => area(1).focus());
      vi.useFakeTimers();
      act(() => area(1).blur());
      spy.mockClear();

      for (const ms of [800, 1_100, 1_400, 2_700, 3_100]) {
        player.currentMs = ms; // steps of at most 1.5 s: playback, not a seek
        rerender(tree());
      }

      expect(spy).not.toHaveBeenCalled();
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

  describe('saving', () => {
    const PUT = { method: 'PUT', path: `/api/videos/${ID}/vietsub/text` };
    const saved: VideoDto = { ...video, viSource: 'MANUAL', viUpdatedAt: '2026-11-09T12:00:00Z' };
    const saveButton = () => screen.getByRole('button', { name: 'Save (Ctrl+S)' });

    it('has an icon Save button with a tooltip', async () => {
      await renderEditor();

      expect(saveButton().querySelector('svg')).not.toBeNull();
      expect(saveButton()).toHaveClass('button--icon');
      await expectTooltip(saveButton(), 'Save (Ctrl+S)');
    });

    it('keeps Save disabled until something changes, and disables it again for an empty or over-long line', async () => {
      await renderEditor();
      const user = userEvent.setup();
      expect(saveButton()).toBeDisabled();
      expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();

      await user.type(area(1), '!');
      expect(saveButton()).toBeEnabled();
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

      await user.clear(area(2));
      expect(saveButton()).toBeDisabled();
      expect(screen.getByText(/Every line needs text/)).toBeInTheDocument();

      await user.type(area(2), 'ok');
      expect(saveButton()).toBeEnabled();
    });

    it('sends the base version and every line in order, then shows the toast, the Manual badge and a clean state', async () => {
      await renderEditor();
      const calls = fakeFetch([...routes(), { ...PUT, status: 200, body: saved }]);
      const user = userEvent.setup();
      await user.type(area(2), ' nữa');

      await user.click(saveButton());

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Vietsub saved'));
      const put = calls.find((c) => c.method === 'PUT')!;
      expect(JSON.parse(put.body as string)).toEqual({
        baseUpdatedAt: '2026-11-02T11:00:00Z',
        lines: [
          { idx: 0, text: 'Xin chào' },
          { idx: 1, text: 'Tạm biệt nữa' },
          { idx: 2, text: 'Hẹn gặp lại' },
        ],
      });
      expect(screen.getByText('Manual', { exact: true })).toBeInTheDocument();
      expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
      expect(screen.queryByRole('img', { name: 'Edited' })).not.toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
      expect(area(2)).toHaveValue('Tạm biệt nữa');
    });

    it('uses the version returned by the last save for the next one', async () => {
      await renderEditor();
      const calls = fakeFetch([...routes(), { ...PUT, status: 200, body: saved }]);
      const user = userEvent.setup();
      await user.type(area(1), 'a');
      await user.click(saveButton());
      await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));

      await user.type(area(1), 'b');
      await user.click(saveButton());
      await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(2));

      const puts = calls.filter((c) => c.method === 'PUT');
      expect(JSON.parse(puts[1].body as string).baseUpdatedAt).toBe('2026-11-09T12:00:00Z');
    });

    it('saves with Ctrl+S from inside a textarea, and does nothing when there is nothing to save', async () => {
      await renderEditor();
      const calls = fakeFetch([...routes(), { ...PUT, status: 200, body: saved }]);
      const user = userEvent.setup();

      await user.click(area(1));
      await user.keyboard('{Control>}s{/Control}');
      expect(calls.some((c) => c.method === 'PUT')).toBe(false);

      await user.keyboard('x');
      const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
      act(() => {
        area(1).dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(true); // the browser's "save page" dialog stays closed
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Vietsub saved'));
      expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);

      await user.type(area(1), 'y');
      await user.keyboard('{Meta>}s{/Meta}'); // ⌘S
      await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(2));
    });

    it('on 409 asks to reload, keeps the edits, and Reload brings back the stored version', async () => {
      await renderEditor();
      fakeFetch([...routes(), { ...PUT, status: 409, body: problem(409, 'VIETSUB_CHANGED', 'changed') }]);
      const user = userEvent.setup();
      await user.type(area(1), '!!');

      await user.click(saveButton());

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('This Vietsub changed since you opened it.');
      expect(alert).toHaveTextContent('Reload to see the latest version.');
      expect(area(1)).toHaveValue('Xin chào!!');
      expect(toast.success).not.toHaveBeenCalled();

      fakeFetch(routes({ ...video, viUpdatedAt: '2026-11-09T09:00:00Z' }, [{ ...cues[0], text: 'Bản mới' }, cues[1], cues[2]]));
      await user.click(within(alert).getByRole('button', { name: 'Reload' }));

      await waitFor(() => expect(area(1)).toHaveValue('Bản mới'));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('on 400 marks the rejected lines, scrolls to the first and keeps the edits', async () => {
      await renderEditor();
      const body = {
        ...problem(400, 'INVALID_VIETSUB_TEXT', 'bad'),
        errors: [
          { field: 'lines[1].text', message: 'Text is longer than 1000 characters' },
          { field: 'lines[2].text', message: 'Text is required' },
        ],
      };
      fakeFetch([...routes(), { ...PUT, status: 400, body }]);
      const user = userEvent.setup();
      await user.type(area(2), '!');
      const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
      spy.mockClear();

      await user.click(saveButton());

      expect(await within(row(2)).findByText('Text is longer than 1000 characters')).toBeInTheDocument();
      expect(within(row(3)).getByText('Text is required')).toBeInTheDocument();
      expect(area(2)).toHaveAttribute('aria-invalid', 'true');
      expect(area(2)).toHaveAccessibleDescription('Text is longer than 1000 characters');
      expect(area(1)).not.toHaveAttribute('aria-invalid');
      expect(area(2)).toHaveValue('Tạm biệt!');
      await waitFor(() => expect(spy.mock.contexts).toContain(area(2)));

      await user.type(area(2), '?'); // typing in a rejected line clears its message
      expect(within(row(2)).queryByText('Text is longer than 1000 characters')).not.toBeInTheDocument();
    });

    it('on a network error shows an alert and keeps the edits', async () => {
      await renderEditor();
      fakeFetch(routes()); // the PUT has no route, so it fails like a dropped connection
      const user = userEvent.setup();
      await user.type(area(1), '!');

      await user.click(saveButton());

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(area(1)).toHaveValue('Xin chào!');
      expect(saveButton()).toBeEnabled();
    });

    it('cannot be saved while Gemini translates', async () => {
      await renderEditor({ ...video, translationStatus: 'TRANSLATING' });

      expect(saveButton()).toBeDisabled();
    });
  });

  describe('edit status', () => {
    const manual: VideoDto = { ...video, viSource: 'MANUAL', editStatus: 'IN_PROGRESS' };
    const STATUS = { method: 'PUT', path: `/api/videos/${ID}/edit-status` };
    const markDone = () => screen.getByRole('button', { name: 'Mark as done' });

    it('Mark as done sends DONE, toasts, and swaps to Reopen', async () => {
      await renderEditor(manual);
      const calls = fakeFetch([...routes(manual), { ...STATUS, status: 200, body: { ...manual, editStatus: 'DONE' } }]);
      const user = userEvent.setup();
      await expectTooltip(markDone(), 'Mark as done');

      await user.click(markDone());

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Marked as done'));
      expect(JSON.parse(calls.find((c) => c.method === 'PUT')!.body as string)).toEqual({ status: 'DONE' });
      expect(screen.queryByRole('button', { name: 'Mark as done' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reopen (back to In progress)' })).toBeInTheDocument();
    });

    it('Reopen sends IN_PROGRESS, toasts, and swaps back to Mark as done', async () => {
      const done: VideoDto = { ...manual, editStatus: 'DONE' };
      await renderEditor(done);
      const calls = fakeFetch([...routes(done), { ...STATUS, status: 200, body: manual }]);
      const user = userEvent.setup();
      expect(screen.queryByRole('button', { name: 'Mark as done' })).not.toBeInTheDocument();
      await expectTooltip(screen.getByRole('button', { name: 'Reopen (back to In progress)' }), 'Reopen (back to In progress)');

      await user.click(screen.getByRole('button', { name: 'Reopen (back to In progress)' }));

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Reopened'));
      expect(JSON.parse(calls.find((c) => c.method === 'PUT')!.body as string)).toEqual({ status: 'IN_PROGRESS' });
      expect(markDone()).toBeEnabled();
    });

    it('Mark as done is disabled while there are unsaved changes, and says why', async () => {
      await renderEditor(manual);
      const user = userEvent.setup();
      await user.type(area(1), '!');

      expect(markDone()).toBeDisabled();
      await expectTooltip(markDone().parentElement as HTMLElement, 'Save your changes first');
    });

    it('Mark as done is disabled while Gemini translates', async () => {
      await renderEditor({ ...manual, translationStatus: 'TRANSLATING' });

      expect(markDone()).toBeDisabled();
    });

    it('shows an alert when the server refuses', async () => {
      await renderEditor(manual);
      fakeFetch([...routes(manual), { ...STATUS, status: 409, body: problem(409, 'VIETSUB_NOT_MANUAL', 'no') }]);

      await userEvent.setup().click(markDone());

      expect(await screen.findByRole('alert')).toHaveTextContent('Only a Vietsub that has been edited');
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe('seek and play on focus', () => {
    it('focusing another line seeks the video to its start and plays; the same line again does not', async () => {
      await renderEditor();
      const user = userEvent.setup();

      await user.click(area(3));
      expect(player.seekTo).toHaveBeenCalledTimes(1);
      expect(player.seekTo).toHaveBeenLastCalledWith(3_000);
      expect(player.play).toHaveBeenCalledTimes(1);

      await user.click(area(3)); // click inside the same line
      await user.keyboard('{ArrowLeft}x');
      expect(player.seekTo).toHaveBeenCalledTimes(1);

      await user.tab({ shift: true }); // focus leaves the line; coming back to it is not a new line
      await user.click(area(3));
      expect(player.seekTo).toHaveBeenCalledTimes(1);

      await user.click(area(1));
      expect(player.seekTo).toHaveBeenCalledTimes(2);
      expect(player.seekTo).toHaveBeenLastCalledWith(0);
      expect(player.play).toHaveBeenCalledTimes(2);
    });

    it('the number button still only seeks (no play, no focus change)', async () => {
      await renderEditor();

      await userEvent.setup().click(screen.getByRole('button', { name: 'Go to line 3' }));

      expect(player.seekTo).toHaveBeenCalledWith(3_000);
      expect(player.play).not.toHaveBeenCalled();
    });

    it('does not seek or play while Gemini translates', async () => {
      await renderEditor({ ...video, translationStatus: 'TRANSLATING' });

      await userEvent.setup().click(area(2));

      expect(player.seekTo).not.toHaveBeenCalled();
      expect(player.play).not.toHaveBeenCalled();
    });

    it('keeps the table still after the focus seek (the seek does not end the scroll wait)', async () => {
      const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
      const { rerender } = await renderEditor();
      await act(async () => area(3).focus());
      spy.mockClear();

      player.currentMs = 3_000; // what the real player reports after the focus seek
      rerender(tree());
      player.currentMs = 3_100; // playback continues
      rerender(tree());

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('unsaved changes guard', () => {
    it('asks the browser before closing the tab only while there are unsaved edits', async () => {
      await renderEditor();
      const clean = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(clean);
      expect(clean.defaultPrevented).toBe(false);

      await userEvent.setup().type(area(1), '!');
      const dirty = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(dirty);
      expect(dirty.defaultPrevented).toBe(true);
    });

    it('lets in-app links through when nothing was edited', async () => {
      await renderEditor();

      await userEvent.setup().click(screen.getByRole('link', { name: 'Away' }));

      expect(await screen.findByText('away page')).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('confirms before an in-app link with unsaved edits: Cancel stays, Leave goes', async () => {
      await renderEditor();
      const user = userEvent.setup();
      await user.type(area(1), '!');

      await user.click(screen.getByRole('link', { name: 'Away' }));
      await answerConfirm('Cancel', 'Discard unsaved changes?');
      expect(screen.queryByText('away page')).not.toBeInTheDocument();
      expect(area(1)).toHaveValue('Xin chào!');

      await user.click(screen.getByRole('link', { name: 'Away' }));
      await answerConfirm('Leave', 'Discard unsaved changes?');
      expect(await screen.findByText('away page')).toBeInTheDocument();
    });

    it('does not ask after the edits were saved', async () => {
      await renderEditor();
      fakeFetch([...routes(), { method: 'PUT', path: `/api/videos/${ID}/vietsub/text`, status: 200, body: { ...video, viSource: 'MANUAL' } }]);
      const user = userEvent.setup();
      await user.type(area(1), '!');
      await user.click(screen.getByRole('button', { name: 'Save (Ctrl+S)' }));
      await waitFor(() => expect(toast.success).toHaveBeenCalled());

      await user.click(screen.getByRole('link', { name: 'Away' }));

      expect(await screen.findByText('away page')).toBeInTheDocument();
    });
  });
});
