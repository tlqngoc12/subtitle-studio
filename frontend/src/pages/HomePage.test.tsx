import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerConfirm } from '../test/confirm';
import { loadedRegion } from '../test/loadedRegion';
import { expectTooltip } from '../test/tooltip';
import { MemoryRouter, useLocation } from 'react-router';
import HomePage from './HomePage';
import { AppToaster } from '../components/AppToaster';
import type { CueDto, VideoDto } from '../api/client';

const ID = 'dQw4w9WgXcQ';

const autoVideo: VideoDto = {
  id: ID,
  title: 'Học Spring Boot',
  channel: 'Dev Channel',
  durationSec: 754,
  subLang: 'en-orig',
  subSource: 'AUTO',
  cueCount: 2,
  fetchedAt: '2026-11-02T10:00:00Z',
  thumbnailUrl: `https://i.ytimg.com/vi/${ID}/mqdefault.jpg`,
  viCueCount: 0,
  viUpdatedAt: null,
  viSource: null,
  translationStatus: null,
  translationError: null,
  translationProfile: null,
  translationModel: null,
};

const manualVideo: VideoDto = {
  ...autoVideo,
  id: 'MANUAL00001',
  title: 'Manual talk',
  subLang: 'en',
  subSource: 'MANUAL',
  cueCount: 3,
  thumbnailUrl: 'https://i.ytimg.com/vi/MANUAL00001/mqdefault.jpg',
};

const cues: CueDto[] = [
  { idx: 0, startMs: 1_000, endMs: 6_010, text: "so today we're going to talk" },
  { idx: 1, startMs: 6_010, endMs: 8_500, text: 'and why it matters' },
];

type Route = {
  method: string;
  path: string;
  status: number;
  body?: unknown;
  delay?: Promise<void>;
  /** Replies used one per call, in order; the last one repeats. Overrides status/body. */
  replies?: { status: number; body?: unknown }[];
};

/** Minimal fetch fake: first matching route wins; records every call. */
function fakeFetch(routes: Route[]) {
  const calls: { method: string; path: string; body?: string }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = String(input);
    calls.push({ method, path, body: init?.body as string | undefined });
    const route = routes.find((r) => r.method === method && r.path === path);
    if (!route) throw new TypeError('Failed to fetch');
    if (route.delay) await route.delay;
    const reply = route.replies ? (route.replies.length > 1 ? route.replies.shift()! : route.replies[0]) : route;
    const isProblem = reply.status >= 400;
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'Content-Type': isProblem ? 'application/problem+json' : 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

function problem(status: number, code: string, detail: string) {
  return { type: 'about:blank', title: 'Error', status, detail, code };
}

/** `n` fetched videos titled "Video 01"…, in the order the API returns them. */
function many(n: number): VideoDto[] {
  return Array.from({ length: n }, (_, i) => {
    const num = String(i + 1).padStart(2, '0');
    return { ...autoVideo, id: `VIDEO0000${num}`, title: `Video ${num}` };
  });
}

function Location() {
  const { search } = useLocation();
  return <output aria-label="search">{search}</output>;
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <HomePage />
      <Location />
    </MemoryRouter>,
  );
}

const titles = (list: HTMLElement) =>
  within(within(list).getByRole('list')).getAllByRole('listitem').map((li) => within(li).getByText(/^Video \d+$|^Học Spring Boot$/).textContent);

async function submit(url: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('YouTube link'), url);
  await user.click(screen.getByRole('button', { name: 'Get Engsub' }));
  return user;
}

describe('HomePage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('translation profile', () => {
    const profilesRoute = (configured: boolean, profiles: string[]): Route => ({
      method: 'GET', path: '/api/prompt-profiles', status: 200, body: { configured, profiles },
    });

    it('lists profiles with "no translation" as the default', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [] }, profilesRoute(true, ['EmiBonnie', 'Other'])]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);

      const select = await screen.findByLabelText('Translation profile');
      await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));
      expect(within(select).getAllByRole('option').map((o) => o.textContent))
        .toEqual(['— No translation —', 'EmiBonnie', 'Other']);
      expect(select).toHaveValue('');
      expect(select).toBeEnabled();
    });

    it('disables profiles when Gemini is not configured', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [] }, profilesRoute(false, ['EmiBonnie'])]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);

      const select = await screen.findByLabelText('Translation profile');
      await waitFor(() => expect(select).toBeDisabled());
      await expectTooltip(select.parentElement!, 'GEMINI_API_KEY is not set');
    });

    it('sends the chosen profile with Get Engsub', async () => {
      const calls = fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: [] },
        profilesRoute(true, ['EmiBonnie']),
        { method: 'POST', path: '/api/videos', status: 201, body: autoVideo },
        { method: 'GET', path: `/api/videos/${ID}/cues`, status: 200, body: cues },
      ]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      const select = await screen.findByLabelText('Translation profile');
      await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2));

      await userEvent.setup().selectOptions(select, 'EmiBonnie');
      await submit(ID);

      expect(calls.find((c) => c.method === 'POST')?.body).toBe(JSON.stringify({ url: ID, profile: 'EmiBonnie' }));
    });

    it('omits the profile when "no translation" is chosen', async () => {
      const calls = fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: [] },
        profilesRoute(true, ['EmiBonnie']),
        { method: 'POST', path: '/api/videos', status: 201, body: autoVideo },
        { method: 'GET', path: `/api/videos/${ID}/cues`, status: 200, body: cues },
      ]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      await screen.findByLabelText('Translation profile');

      await submit(ID);

      expect(calls.find((c) => c.method === 'POST')?.body).toBe(JSON.stringify({ url: ID }));
    });

    it('remembers the last profile', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [] }, profilesRoute(true, ['EmiBonnie'])]);
      const first = render(<MemoryRouter><HomePage /></MemoryRouter>);
      const select = await screen.findByLabelText('Translation profile');
      await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2));
      await userEvent.setup().selectOptions(select, 'EmiBonnie');
      first.unmount();

      render(<MemoryRouter><HomePage /></MemoryRouter>);

      await waitFor(() => expect(screen.getByLabelText('Translation profile')).toHaveValue('EmiBonnie'));
    });

    it('forgets a remembered profile that no longer exists', async () => {
      localStorage.setItem('subtitle-studio.profile', 'Gone');
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [] }, profilesRoute(true, ['EmiBonnie'])]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);

      const select = await screen.findByLabelText('Translation profile');
      await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2));
      expect(select).toHaveValue('');
    });
  });

  it('invites the user to paste a link when nothing was fetched yet', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [] }]);

    render(<MemoryRouter><HomePage /></MemoryRouter>);

    expect(await screen.findByText(/No videos yet/)).toBeInTheDocument();
  });

  it('disables the button and shows progress while fetching', async () => {
    let release!: () => void;
    const delay = new Promise<void>((r) => (release = r));
    const calls = fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [] },
      { method: 'POST', path: '/api/videos', status: 201, body: autoVideo, delay },
      { method: 'GET', path: `/api/videos/${ID}/cues`, status: 200, body: cues },
    ]);
    render(<MemoryRouter><HomePage /></MemoryRouter>);

    await submit(`https://youtu.be/${ID}`);

    expect(screen.getByRole('button', { name: /Fetching/ })).toBeDisabled();
    expect(calls.find((c) => c.method === 'POST')?.body).toBe(JSON.stringify({ url: `https://youtu.be/${ID}` }));
    release();
    expect(await screen.findByRole('heading', { name: 'Học Spring Boot' })).toBeInTheDocument();
    // Re-enabled only after the cue preview has loaded too.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Get Engsub' })).toBeEnabled());
  });

  it('shows the fetched video with note, count, download link and cue preview', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [] },
      { method: 'POST', path: '/api/videos', status: 201, body: autoVideo },
      { method: 'GET', path: `/api/videos/${ID}/cues`, status: 200, body: cues },
    ]);
    render(<MemoryRouter><HomePage /></MemoryRouter>);

    await submit(ID);

    const result = await screen.findByRole('region', { name: 'Result' });
    expect(within(result).getByRole('heading', { name: 'Học Spring Boot' })).toBeInTheDocument();
    expect(within(result).getByText('Dev Channel')).toBeInTheDocument();
    expect(within(result).getByText('12:34')).toBeInTheDocument();
    expect(within(result).queryByText(/Auto-generated/)).not.toBeInTheDocument();
    expect(within(result).getByText(/no punctuation/)).toBeInTheDocument();
    expect(within(result).getByText('2 lines')).toBeInTheDocument();
    expect(within(result).getByRole('link', { name: 'Download Engsub' }))
      .toHaveAttribute('href', `/api/videos/${ID}/subtitle.srt`);
    expect(within(result).getByRole('img')).toHaveAttribute('src', autoVideo.thumbnailUrl);

    const table = await within(result).findByRole('table');
    expect(within(table).getByText('00:00:01,000')).toBeInTheDocument();
    expect(within(table).getByText("so today we're going to talk")).toBeInTheDocument();
    expect(within(table).getByText('and why it matters')).toBeInTheDocument();
  });

  it('shows neither a Manual label nor the auto-caption note for manual subtitles', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [] },
      { method: 'POST', path: '/api/videos', status: 200, body: manualVideo },
      { method: 'GET', path: '/api/videos/MANUAL00001/cues', status: 200, body: cues },
    ]);
    render(<MemoryRouter><HomePage /></MemoryRouter>);

    await submit('MANUAL00001');

    const result = await screen.findByRole('region', { name: 'Result' });
    expect(within(result).queryByText('Manual')).not.toBeInTheDocument();
    expect(within(result).getByText('3 lines')).toBeInTheDocument();
    expect(within(result).queryByText(/no punctuation/)).not.toBeInTheDocument();
  });

  it('explains an invalid link using the error code', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [] },
      { method: 'POST', path: '/api/videos', status: 400, body: problem(400, 'INVALID_URL', 'Not a valid YouTube URL') },
    ]);
    render(<MemoryRouter><HomePage /></MemoryRouter>);

    await submit('https://evil.com/x');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid link');
    // The link stays so it can be corrected.
    expect(screen.getByLabelText('YouTube link')).toHaveValue('https://evil.com/x');
  });

  it('warns with a toast when the video was already fetched, and still opens it', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [autoVideo] },
      // 200 instead of 201: the backend returned the stored video without calling YouTube.
      { method: 'POST', path: '/api/videos', status: 200, body: autoVideo },
      { method: 'GET', path: `/api/videos/${ID}/cues`, status: 200, body: cues },
    ]);
    render(<MemoryRouter><HomePage /><AppToaster /></MemoryRouter>);

    await submit(`https://youtu.be/${ID}`);

    const toast = (await screen.findByText('Already fetched: Học Spring Boot')).closest('li')!;
    expect(toast).toHaveAttribute('data-type', 'warning');
    expect(await screen.findByRole('region', { name: 'Result' })).toBeInTheDocument();
  });

  it('shows no warning toast for a newly fetched video', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [] },
      { method: 'POST', path: '/api/videos', status: 201, body: autoVideo },
      { method: 'GET', path: `/api/videos/${ID}/cues`, status: 200, body: cues },
    ]);
    render(<MemoryRouter><HomePage /><AppToaster /></MemoryRouter>);

    await submit(`https://youtu.be/${ID}`);

    await screen.findByRole('region', { name: 'Result' });
    expect(screen.queryByText(/Already fetched/)).not.toBeInTheDocument();
  });

  it('clears the link field after a successful Get Engsub', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [] },
      { method: 'POST', path: '/api/videos', status: 201, body: autoVideo },
      { method: 'GET', path: `/api/videos/${ID}/cues`, status: 200, body: cues },
    ]);
    render(<MemoryRouter><HomePage /></MemoryRouter>);

    await submit(`https://youtu.be/${ID}`);

    await screen.findByRole('region', { name: 'Result' });
    const field = screen.getByLabelText('YouTube link');
    await waitFor(() => expect(field).toHaveValue(''));
    expect(field).toHaveAttribute('placeholder', 'Paste a YouTube link here');
  });

  it('explains a video without English subtitles', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [] },
      { method: 'POST', path: '/api/videos', status: 422, body: problem(422, 'NO_ENGLISH_SUBTITLE', 'No English') },
    ]);
    render(<MemoryRouter><HomePage /></MemoryRouter>);

    await submit(ID);

    expect(await screen.findByRole('alert')).toHaveTextContent('This video has no English subtitles');
  });

  it('explains when the server cannot be reached', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [] }]);
    render(<MemoryRouter><HomePage /></MemoryRouter>);

    await submit(ID);

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server');
  });

  it('does not submit an empty link', async () => {
    const calls = fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [] }]);
    render(<MemoryRouter><HomePage /></MemoryRouter>);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Get Engsub' }));

    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  describe('Vietsub status', () => {
    const profiles: Route = {
      method: 'GET', path: '/api/prompt-profiles', status: 200, body: { configured: true, profiles: ['EmiBonnie'] },
    };
    const cuesRoute: Route = { method: 'GET', path: `/api/videos/${ID}/cues`, status: 200, body: cues };
    const translating: VideoDto = { ...autoVideo, translationStatus: 'TRANSLATING', translationProfile: 'EmiBonnie' };
    const done: VideoDto = {
      ...autoVideo, viCueCount: 2, viSource: 'AUTO', translationStatus: null, translationProfile: 'EmiBonnie',
    };
    const manual: VideoDto = { ...autoVideo, viCueCount: 2, viSource: 'MANUAL' };
    const failed: VideoDto = {
      ...autoVideo, translationStatus: 'FAILED', translationError: 'Gemini free quota is used up, try again later.',
    };

    afterEach(() => {
      vi.useRealTimers();
    });

    /** userEvent that also moves fake timers forward when a test uses them. */
    const user = () => userEvent.setup(vi.isFakeTimers() ? { advanceTimers: vi.advanceTimersByTime } : {});

    async function chooseProfile() {
      const select = await screen.findByLabelText('Translation profile');
      await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2));
      await user().selectOptions(select, 'EmiBonnie');
    }

    async function openFromHistory() {
      const history = await loadedRegion('Fetched earlier');
      await user().click(within(history).getByRole('button', { name: /Open Học Spring Boot/ }));
      return screen.findByRole('region', { name: 'Result' });
    }

    it('shows that Gemini is translating', async () => {
      fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: [] },
        profiles,
        { method: 'POST', path: '/api/videos', status: 201, body: translating },
        { method: 'GET', path: `/api/videos/${ID}`, status: 200, body: translating },
        cuesRoute,
      ]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      await chooseProfile();

      await submit(ID);

      const result = await screen.findByRole('region', { name: 'Result' });
      expect(within(result).getByText('Translating with Gemini (EmiBonnie)…')).toBeInTheDocument();
    });

    it('shows the model while translating and who translated afterwards', async () => {
      fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: [{ ...translating, translationModel: 'gemini-x' }] },
        profiles,
        cuesRoute,
      ]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      const result = await openFromHistory();
      expect(within(result).getByText('Translating with Gemini (EmiBonnie, gemini-x)…')).toBeInTheDocument();
    });

    it('shows Translated by <model> next to an AI Vietsub', async () => {
      fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: [{ ...done, translationModel: 'gemini-x, gemini-y' }] },
        profiles,
        cuesRoute,
      ]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      const result = await openFromHistory();
      expect(within(result).getByText('Translated by gemini-x, gemini-y')).toBeInTheDocument();
    });

    it('polls every 3 s and shows the AUTO Vietsub when done', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const calls = fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: [translating] },
        profiles,
        { method: 'GET', path: `/api/videos/${ID}`, status: 200, replies: [{ status: 200, body: translating }, { status: 200, body: done }] },
        cuesRoute,
      ]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      const result = await openFromHistory();
      expect(within(result).getByText('Translating with Gemini (EmiBonnie)…')).toBeInTheDocument();
      const polls = () => calls.filter((c) => c.path === `/api/videos/${ID}`).length;

      await vi.advanceTimersByTimeAsync(3000);
      await vi.advanceTimersByTimeAsync(3000);

      expect(await within(result).findByText('Vietsub: AI')).toBeInTheDocument();
      expect(within(result).getByRole('link', { name: 'Watch Vietsub' })).toHaveAttribute('href', `/vietsub/${ID}`);
      expect(within(result).getByRole('link', { name: 'Download Vietsub' }))
        .toHaveAttribute('href', `/api/videos/${ID}/subtitle.vi.srt`);
      const afterDone = polls();
      expect(afterDone).toBe(2);

      await vi.advanceTimersByTimeAsync(9000);
      expect(polls()).toBe(afterDone);
    });

    it('shows an uploaded Vietsub without Translate again', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [manual] }, profiles, cuesRoute]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);

      const result = await openFromHistory();

      expect(within(result).getByText('Vietsub: Manual')).toBeInTheDocument();
      expect(within(result).getByText(/Delete the uploaded Vietsub on the Vietsub page/)).toBeInTheDocument();
      expect(within(result).queryByRole('button', { name: /Translate/ })).not.toBeInTheDocument();
    });

    it('shows a failure with Translate again', async () => {
      const calls = fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: [failed] },
        profiles,
        cuesRoute,
        { method: 'POST', path: `/api/videos/${ID}/translate`, status: 202, body: translating },
        { method: 'GET', path: `/api/videos/${ID}`, status: 200, body: translating },
      ]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      await chooseProfile();
      const result = await openFromHistory();

      expect(within(result).getByRole('alert')).toHaveTextContent('Gemini free quota is used up, try again later.');
      await userEvent.setup().click(within(result).getByRole('button', { name: 'Translate again' }));

      expect(calls.find((c) => c.path.endsWith('/translate'))?.body).toBe(JSON.stringify({ profile: 'EmiBonnie' }));
      expect(await within(result).findByText('Translating with Gemini (EmiBonnie)…')).toBeInTheDocument();
    });

    it('asks before replacing an AUTO Vietsub', async () => {
      const calls = fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [done] }, profiles, cuesRoute]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      await chooseProfile();
      const result = await openFromHistory();

      await userEvent.setup().click(within(result).getByRole('button', { name: 'Translate again' }));
      await answerConfirm('Cancel', 'Replace the Gemini Vietsub?');

      expect(calls.some((c) => c.path.endsWith('/translate'))).toBe(false);
    });

    it('disables Translate again without a profile', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [done] }, profiles, cuesRoute]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);

      const result = await openFromHistory();

      expect(within(result).getByRole('button', { name: 'Translate again' })).toBeDisabled();
    });

    it('offers Translate with Gemini for a video without Vietsub', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [autoVideo] }, profiles, cuesRoute]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      await chooseProfile();

      const result = await openFromHistory();

      expect(within(result).getByRole('button', { name: 'Translate with Gemini' })).toBeEnabled();
    });

    it('shows the too-long reason instead of the button', async () => {
      fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: [] },
        profiles,
        { method: 'POST', path: '/api/videos', status: 201, body: { ...autoVideo, skipReason: 'VIDEO_TOO_LONG' } },
        cuesRoute,
      ]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      await chooseProfile();

      await submit(ID);

      const result = await screen.findByRole('region', { name: 'Result' });
      expect(await within(result).findByText('The video is longer than 60 minutes, so it cannot be translated automatically.')).toBeInTheDocument();
      expect(within(result).queryByRole('button', { name: 'Translate with Gemini' })).not.toBeInTheDocument();
    });

    it('marks translating and failed videos in the history', async () => {
      fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: [{ ...translating, id: 'TRANSLATING', title: 'Video 01' }, { ...failed, id: 'FAILEDVIDEO', title: 'Video 02' }] },
        { method: 'GET', path: '/api/videos/TRANSLATING', status: 200, body: { ...translating, id: 'TRANSLATING', title: 'Video 01' } },
        profiles,
      ]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);

      const history = await loadedRegion('Fetched earlier');
      const items = within(within(history).getByRole('list')).getAllByRole('listitem');
      expect(items[0]).toHaveTextContent('Translating…');
      expect(items[1]).toHaveTextContent('Translation failed');
    });

    it('stops polling a video that disappears', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const calls = fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: [translating] },
        profiles,
        { method: 'GET', path: `/api/videos/${ID}`, status: 404, body: problem(404, 'VIDEO_NOT_FOUND', 'gone') },
      ]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      const history = await loadedRegion('Fetched earlier');
      expect(within(history).getAllByRole('listitem')).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(3000);

      await waitFor(() => expect(within(history).queryAllByRole('listitem')).toHaveLength(0));
      const polls = calls.filter((c) => c.path === `/api/videos/${ID}`).length;
      await vi.advanceTimersByTimeAsync(9000);
      expect(calls.filter((c) => c.path === `/api/videos/${ID}`).length).toBe(polls);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('history', () => {
    it('shows the row actions as icons with tooltips', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [{ ...autoVideo, viCueCount: 3 }] }]);

      render(<MemoryRouter><HomePage /></MemoryRouter>);

      const history = await loadedRegion('Fetched earlier');
      const item = within(history).getByRole('listitem');
      const actions = [
        { el: within(item).getByRole('link', { name: 'Watch Video: Học Spring Boot' }), tip: 'Watch Video' },
        { el: within(item).getByRole('link', { name: 'Download Engsub: Học Spring Boot' }), tip: 'Download Engsub' },
        { el: within(item).getByRole('button', { name: 'Delete Học Spring Boot' }), tip: 'Delete' },
      ];
      for (const { el, tip } of actions) {
        await expectTooltip(el, tip);
        expect(el.textContent?.trim()).toBe('');
        expect(el.querySelector('svg')).not.toBeNull();
      }
      // Re-fetching from YouTube (Refresh) was removed.
      expect(within(item).queryByRole('button', { name: /Refresh/ })).not.toBeInTheDocument();
    });

    it('lists previously fetched videos with download links', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [autoVideo, manualVideo] }]);

      render(<MemoryRouter><HomePage /></MemoryRouter>);

      const history = await loadedRegion('Fetched earlier');
      const items = within(history).getAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(within(items[0]).getByText('Học Spring Boot')).toBeInTheDocument();
      expect(within(items[0]).getByRole('link', { name: /Download Engsub/ }))
        .toHaveAttribute('href', `/api/videos/${ID}/subtitle.srt`);
    });

    it('shows cue count and duration without a Manual/Auto-generated label', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [autoVideo, { ...manualVideo, title: 'Talk' }] }]);

      render(<MemoryRouter><HomePage /></MemoryRouter>);

      const history = await loadedRegion('Fetched earlier');
      const items = within(history).getAllByRole('listitem');
      expect(within(items[0]).getByText('2 lines')).toBeInTheDocument();
      expect(within(items[0]).getByText('12:34')).toBeInTheDocument();
      expect(within(items[1]).getByText('3 lines')).toBeInTheDocument();
      expect(within(history).queryByText(/Auto-generated|Manual/)).not.toBeInTheDocument();
    });

    it('links to the Vietsub player for videos that have Vietsub', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [{ ...autoVideo, viCueCount: 3 }, manualVideo] }]);

      render(<MemoryRouter><HomePage /></MemoryRouter>);

      const history = await loadedRegion('Fetched earlier');
      const items = within(history).getAllByRole('listitem');
      expect(within(items[0]).getByRole('link', { name: 'Watch Video: Học Spring Boot' }))
        .toHaveAttribute('href', `/vietsub/${ID}`);
      expect(within(items[1]).queryByRole('link', { name: /Watch Video/ })).not.toBeInTheDocument();
    });

    it('opens a video from the list', async () => {
      fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: [autoVideo] },
        { method: 'GET', path: `/api/videos/${ID}/cues`, status: 200, body: cues },
      ]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      const history = await loadedRegion('Fetched earlier');

      await userEvent.setup().click(within(history).getByRole('button', { name: /Open Học Spring Boot/ }));

      const result = await screen.findByRole('region', { name: 'Result' });
      expect(await within(result).findByText('and why it matters')).toBeInTheDocument();
    });

    it('scrolls up to the result panel (cue timeline) when a video is opened from the list', async () => {
      const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
      fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: [autoVideo] },
        { method: 'GET', path: `/api/videos/${ID}/cues`, status: 200, body: cues },
      ]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      const history = await loadedRegion('Fetched earlier');

      await userEvent.setup().click(within(history).getByRole('button', { name: /Open Học Spring Boot/ }));

      const result = await screen.findByRole('region', { name: 'Result' });
      await waitFor(() => expect(scroll).toHaveBeenCalled());
      expect(scroll.mock.contexts[0]).toBe(result);
      expect(scroll.mock.calls[0][0]).toMatchObject({ block: 'start' });
      // Keyboard and screen-reader users land on the opened video too.
      expect(within(result).getByRole('heading', { name: 'Học Spring Boot' })).toHaveFocus();
    });

    it('deletes a video after confirmation', async () => {
      const calls = fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: [autoVideo, manualVideo] },
        { method: 'DELETE', path: `/api/videos/${ID}`, status: 204 },
      ]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      const history = await loadedRegion('Fetched earlier');

      await userEvent.setup().click(within(history).getByRole('button', { name: /Delete Học Spring Boot/ }));
      await answerConfirm('Delete', 'Delete "Học Spring Boot"?');

      await waitFor(() => expect(within(history).getAllByRole('listitem')).toHaveLength(1));
      expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
    });

    it('keeps the video when deletion is not confirmed', async () => {
      const calls = fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [autoVideo] }]);
      render(<MemoryRouter><HomePage /></MemoryRouter>);
      const history = await loadedRegion('Fetched earlier');

      await userEvent.setup().click(within(history).getByRole('button', { name: /Delete Học Spring Boot/ }));
      await answerConfirm('Cancel');

      expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
      expect(within(history).getAllByRole('listitem')).toHaveLength(1);
    });

    describe('pagination', () => {
      it('shows 10 videos per page and keeps the page in the URL', async () => {
        fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: many(23) }]);
        renderAt('/');
        const history = await loadedRegion('Fetched earlier');
        expect(titles(history)).toEqual(many(10).map((v) => v.title));
        expect(within(history).getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');

        await userEvent.setup().click(within(history).getByRole('button', { name: 'Page 2' }));

        expect(titles(history)[0]).toBe('Video 11');
        expect(screen.getByLabelText('search')).toHaveTextContent('?page=2');
      });

      it('has no pager for 10 videos or fewer', async () => {
        fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: many(10) }]);
        renderAt('/');

        const history = await loadedRegion('Fetched earlier');
        expect(within(history).queryByRole('navigation')).not.toBeInTheDocument();
      });

      it('goes back to page 1 after fetching, where the new video comes first', async () => {
        fakeFetch([
          { method: 'GET', path: '/api/videos', status: 200, body: many(15) },
          { method: 'POST', path: '/api/videos', status: 201, body: autoVideo },
          { method: 'GET', path: `/api/videos/${ID}/cues`, status: 200, body: cues },
        ]);
        renderAt('/?page=2');
        const history = await loadedRegion('Fetched earlier');
        expect(titles(history)[0]).toBe('Video 11');

        await submit(ID);

        await waitFor(() => expect(titles(history)[0]).toBe('Học Spring Boot'));
        await waitFor(() => expect(screen.getByLabelText('search')).toHaveTextContent(/^$/));
      });

      it('steps back a page after deleting the only video on the last page', async () => {
        fakeFetch([
          { method: 'GET', path: '/api/videos', status: 200, body: many(11) },
          { method: 'DELETE', path: '/api/videos/VIDEO000011', status: 204 },
        ]);
        renderAt('/?page=2');
        const history = await loadedRegion('Fetched earlier');

        await userEvent.setup().click(within(history).getByRole('button', { name: 'Delete Video 11' }));
        await answerConfirm('Delete');

        await waitFor(() => expect(titles(history)).toHaveLength(10));
        expect(within(history).queryByRole('navigation')).not.toBeInTheDocument();
        await waitFor(() => expect(screen.getByLabelText('search')).toHaveTextContent(/^$/));
      });
    });
  });
});
