import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router';
import { describe, expect, it } from 'vitest';
import { answerConfirm } from '../test/confirm';
import { loadedRegion } from '../test/loadedRegion';
import type { VideoDto } from '../api/client';
import { NavBar } from '../components/NavBar';
import { fakeFetch, problem } from '../test/fakeFetch';
import { expectTooltip } from '../test/tooltip';
import VietsubPage from './VietsubPage';
import { AppToaster } from '../components/AppToaster';

const ID = 'dQw4w9WgXcQ';

function video(id: string, title: string, viCueCount: number, viUpdatedAt: string | null, viSource: 'AUTO' | 'MANUAL' = 'MANUAL'): VideoDto {
  return {
    id,
    title,
    channel: 'Dev Channel',
    durationSec: 754,
    subLang: 'en',
    subSource: 'MANUAL',
    cueCount: 10,
    fetchedAt: '2026-11-02T09:00:00Z',
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    viCueCount,
    viUpdatedAt,
    viSource: viCueCount > 0 ? viSource : null,
    translationStatus: null,
    translationError: null,
    translationProfile: null,
  };
}

const none = video('NONE0000001', 'Chưa có Vietsub', 0, null);
const older = video('OLDER000001', 'Video cũ hơn', 5, '2026-11-02T10:00:00Z');
const newer = video(ID, 'Học Spring Boot', 7, '2026-11-02T11:00:00Z');

function WatchStub() {
  const { id } = useParams();
  return <p>watch {id}</p>;
}

function Location() {
  const { search } = useLocation();
  return <output aria-label="search">{search}</output>;
}

function renderPage(entry = '/vietsub') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <NavBar />
      <AppToaster />
      <Routes>
        <Route path="/vietsub" element={<><VietsubPage /><Location /></>} />
        <Route path="/vietsub/:id" element={<WatchStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** `n` videos with Vietsub, "Video 01" updated most recently so it comes first. */
function many(n: number): VideoDto[] {
  return Array.from({ length: n }, (_, i) => {
    const num = String(i + 1).padStart(2, '0');
    return video(`VIDEO0000${num}`, `Video ${num}`, 5, `2026-11-02T10:${String(59 - i).padStart(2, '0')}:00Z`);
  });
}

const titles = (list: HTMLElement) =>
  within(within(list).getByRole('list')).getAllByRole('listitem').map((li) => within(li).getByText(/^Video \d+$/).textContent);

const srtFile = () => new File(['1\n00:00:01,000 --> 00:00:02,000\nXin chào\n'], 'vi.srt', { type: 'application/x-subrip' });

async function fillForm(url: string, file?: File) {
  const user = userEvent.setup();
  if (url) await user.type(screen.getByLabelText('YouTube link'), url);
  if (file) await user.upload(screen.getByLabelText('Vietsub file (.srt)'), file);
  await user.click(screen.getByRole('button', { name: 'Add Vietsub' }));
  return user;
}

describe('VietsubPage', () => {

  it('explains the page in one short sentence', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [] }]);
    renderPage();

    expect(
      screen.getByText('Add a Vietnamese .srt (same timing) to a YouTube video and watch it with Vietsub.'),
    ).toBeInTheDocument();
    expect(await screen.findByText(/No videos with Vietsub yet/)).toBeInTheDocument();
  });

  it('shows the chosen .srt file name', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [] }]);
    renderPage();
    expect(screen.getByText('No file chosen')).toBeInTheDocument();

    await userEvent.setup().upload(screen.getByLabelText('Vietsub file (.srt)'), srtFile());

    expect(screen.getByText('vi.srt')).toBeInTheDocument();
    expect(await screen.findByText(/No videos with Vietsub yet/)).toBeInTheDocument();
  });

  it('shows the nav with Vietsub as current page', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [] }]);
    renderPage();

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Vietsub' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Get Engsub' })).toHaveAttribute('href', '/');
    const tabs = screen.getByRole('navigation', { name: 'Vietsub' });
    expect(within(tabs).getByRole('link', { name: 'Videos' })).toHaveAttribute('aria-current', 'page');
    expect(within(tabs).getByRole('link', { name: 'Playlists' })).toHaveAttribute('href', '/vietsub/playlists');
    // Same underline tabs as the Vietsub list page (not the pill style of the profile tabs).
    expect(tabs).toHaveClass('tabs__list');
    expect(within(tabs).getByRole('link', { name: 'Videos' })).toHaveClass('tabs__tab');
    expect(within(tabs).getByRole('link', { name: 'Playlists' })).toHaveClass('tabs__tab');
    // Let the list load finish inside the test (otherwise a slow machine logs an act() warning).
    expect(await screen.findByText(/No videos with Vietsub yet/)).toBeInTheDocument();
  });

  it('manages only videos with Vietsub, newest update first', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [none, older, newer] }]);
    renderPage();

    const list = await loadedRegion('Manage Vietsub');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Học Spring Boot')).toBeInTheDocument();
    expect(within(items[0]).getByText('7 lines')).toBeInTheDocument();
    expect(within(items[1]).getByText('Video cũ hơn')).toBeInTheDocument();
  });

  it('labels each Vietsub as Manual (uploaded) or AI (Gemini)', async () => {
    const auto = { ...newer, viSource: 'AUTO' as const, translationProfile: 'EmiBonnie' };
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [auto, older] }]);
    renderPage();

    const list = await loadedRegion('Manage Vietsub');
    const items = within(within(list).getByRole('list')).getAllByRole('listitem');
    expect(within(items[0]).getByText('AI', { exact: true })).toBeInTheDocument();
    expect(within(items[0]).queryByText(/Gemini|EmiBonnie/)).not.toBeInTheDocument();
    expect(within(items[1]).getByText('Manual', { exact: true })).toBeInTheDocument();
    expect(within(list).queryByText('Uploaded')).not.toBeInTheDocument();
  });

  it('opens the watch page from the thumbnail or title of a row, like the Vietsub list', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [newer, older] }]);
    renderPage();
    const list = await loadedRegion('Manage Vietsub');
    const items = within(list).getAllByRole('listitem');

    const row = within(items[0]).getByRole('link', { name: /^Học Spring Boot/ });
    expect(row).toHaveAttribute('href', `/vietsub/${ID}`);
    expect(row.querySelector('img')).not.toBeNull();
    expect(row).toHaveClass('history__open--row'); // stretches to the action buttons, so the whole row shows a pointer
    expect(within(items[1]).getByRole('link', { name: /^Video cũ hơn/ })).toHaveAttribute('href', '/vietsub/OLDER000001');

    await userEvent.setup().click(row);

    expect(await screen.findByText(`watch ${ID}`)).toBeInTheDocument();
  });

  it('invites the user when no video has Vietsub', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [none] }]);
    renderPage();

    expect(await screen.findByText(/No videos with Vietsub yet/)).toBeInTheDocument();
  });

  it('adds Vietsub and opens the player', async () => {
    const calls = fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [] },
      { method: 'POST', path: '/api/vietsub', status: 200, body: newer },
    ]);
    renderPage();

    await fillForm(`https://youtu.be/${ID}`, srtFile());

    expect(await screen.findByText(`watch ${ID}`)).toBeInTheDocument();
    const post = calls.find((c) => c.method === 'POST')!;
    const form = post.body as FormData;
    expect(form.get('url')).toBe(`https://youtu.be/${ID}`);
    expect((form.get('file') as File).name).toBe('vi.srt');
  });

  it('disables the button while adding', async () => {
    const delay = new Promise<void>(() => {});
    fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [] },
      { method: 'POST', path: '/api/vietsub', status: 200, body: newer, delay },
    ]);
    renderPage();

    await fillForm(`https://youtu.be/${ID}`, srtFile());

    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
  });

  it('does not submit without both url and file', async () => {
    const calls = fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [] }]);
    renderPage();

    await fillForm(`https://youtu.be/${ID}`);

    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('shows the INVALID_SRT error with server detail', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [] },
      { method: 'POST', path: '/api/vietsub', status: 400, body: problem(400, 'INVALID_SRT', 'Block 3 is longer than 1000 characters') },
    ]);
    renderPage();

    await fillForm(`https://youtu.be/${ID}`, srtFile());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not read the .srt file');
    expect(alert).toHaveTextContent('Block 3 is longer than 1000 characters');
  });

  it('offers Download, Replace, Delete and Save to playlist for each video', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [newer] }]);
    renderPage();
    const list = await loadedRegion('Manage Vietsub');
    const item = within(list).getByRole('listitem');

    // Replace and Delete are icon buttons with tooltips.
    const replace = within(item).getByLabelText('Replace Vietsub: Học Spring Boot').closest('label')!;
    const remove = within(item).getByRole('button', { name: 'Delete Vietsub: Học Spring Boot' });
    for (const [el, tip] of [[replace, 'Replace Vietsub'], [remove, 'Delete Vietsub']] as const) {
      await expectTooltip(el, tip);
      expect(el.textContent?.trim()).toBe('');
      expect(el.querySelector('svg')).not.toBeNull();
    }
    const download = within(item).getByRole('link', { name: 'Download Vietsub: Học Spring Boot' });
    await expectTooltip(download, 'Download Vietsub');
    expect(download.textContent?.trim()).toBe('');
    expect(download.querySelector('svg')).not.toBeNull();
    expect(download).toHaveAttribute('href', `/api/videos/${ID}/subtitle.vi.srt`);
    expect(download).toHaveAttribute('download');
    expect(within(item).queryByRole('link', { name: /^Watch Video/ })).not.toBeInTheDocument();
    const save = within(item).getByRole('button', { name: 'Save to playlist: Học Spring Boot' });
    await expectTooltip(save, 'Save to playlist');
    expect(save.textContent?.trim()).toBe('');
    expect(save.querySelector('svg')).not.toBeNull();
  });

  describe('search, source filter and order', () => {
    const cafe = video('CAFE0000001', 'Café sáng', 3, '2026-11-02T08:00:00Z', 'MANUAL');
    const aiOld = video('AIOLD000001', 'AI cũ', 3, '2026-11-02T07:00:00Z', 'AUTO');
    const aiNew = video('AINEW000001', 'AI mới', 3, '2026-11-02T09:00:00Z', 'AUTO');
    const names = (list: HTMLElement) =>
      within(within(list).getByRole('list'))
        .getAllByRole('listitem')
        .map((li) => within(li).getByText(/^(Café sáng|AI cũ|AI mới|Video cũ hơn|Video \d+)$/).textContent);

    it('lists AI Vietsub first, then manual, newest first inside each group', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [cafe, aiOld, older, aiNew] }]);
      renderPage();

      const list = await loadedRegion('Manage Vietsub');

      expect(names(list)).toEqual(['AI mới', 'AI cũ', 'Video cũ hơn', 'Café sáng']);
    });

    it('finds a video without typing the accents', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [cafe, aiOld] }]);
      renderPage();
      const list = await loadedRegion('Manage Vietsub');

      await userEvent.setup().type(screen.getByRole('searchbox', { name: 'Search videos' }), 'cafe');

      await waitFor(() => expect(names(list)).toEqual(['Café sáng']));
      expect(screen.getByLabelText('search')).toHaveTextContent('?q=cafe');
    });

    it('says so when nothing matches', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [cafe] }]);
      renderPage('/vietsub?q=zzz');

      expect(await screen.findByText('No videos match your search.')).toBeInTheDocument();
    });

    it('filters by source with the All, AI and Manual chips', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [cafe, aiOld, aiNew] }]);
      renderPage();
      const list = await loadedRegion('Manage Vietsub');
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: 'AI' }));
      await waitFor(() => expect(names(list)).toEqual(['AI mới', 'AI cũ']));
      expect(screen.getByRole('button', { name: 'AI' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('search')).toHaveTextContent('?source=ai');

      await user.click(screen.getByRole('button', { name: 'Manual' }));
      await waitFor(() => expect(names(list)).toEqual(['Café sáng']));

      await user.click(screen.getByRole('button', { name: 'All' }));
      await waitFor(() => expect(names(list)).toHaveLength(3));
      expect(screen.getByLabelText('search')).toHaveTextContent('');
    });

    it('restores the search and the filter from the URL', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [cafe, aiOld, older] }]);
      renderPage('/vietsub?q=x&source=manual');

      expect(await screen.findByText('No videos match your search.')).toBeInTheDocument();
      expect(screen.getByRole('searchbox', { name: 'Search videos' })).toHaveValue('x');
      expect(screen.getByRole('button', { name: 'Manual' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('paginates after filtering', async () => {
      const ai = many(12).map((v) => ({ ...v, viSource: 'AUTO' as const }));
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [...ai, cafe] }]);
      renderPage('/vietsub?source=manual&page=2');

      const list = await loadedRegion('Manage Vietsub');

      // Only one manual video, so page 2 does not exist and the URL falls back to page 1.
      expect(names(list)).toEqual(['Café sáng']);
      expect(screen.getByLabelText('search')).toHaveTextContent('?source=manual');
    });
  });

  it('replaces Vietsub from the list', async () => {
    const replaced = { ...newer, viCueCount: 9, viUpdatedAt: '2026-11-02T12:00:00Z' };
    const calls = fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [newer] },
      { method: 'POST', path: '/api/vietsub', status: 200, body: replaced },
    ]);
    renderPage();
    const list = await loadedRegion('Manage Vietsub');

    await userEvent.setup().upload(within(list).getByLabelText('Replace Vietsub: Học Spring Boot'), srtFile());

    expect(await within(list).findByText('9 lines')).toBeInTheDocument();
    expect((calls.find((c) => c.method === 'POST')!.body as FormData).get('url')).toBe(ID);
  });

  it('confirms a finished replace with a toast', async () => {
    const replaced = { ...newer, viCueCount: 9, viUpdatedAt: '2026-11-02T12:00:00Z' };
    fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [newer] },
      { method: 'POST', path: '/api/vietsub', status: 200, body: replaced },
    ]);
    renderPage();
    const list = await loadedRegion('Manage Vietsub');

    await userEvent.setup().upload(within(list).getByLabelText('Replace Vietsub: Học Spring Boot'), srtFile());

    const toast = (await screen.findByText('Vietsub replaced: Học Spring Boot (9 lines)')).closest('li')!;
    expect(within(toast).getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('shows no success toast when replacing fails', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [newer] },
      { method: 'POST', path: '/api/vietsub', status: 400, body: problem(400, 'INVALID_SRT', 'No subtitle blocks found') },
    ]);
    renderPage();
    const list = await loadedRegion('Manage Vietsub');

    await userEvent.setup().upload(within(list).getByLabelText('Replace Vietsub: Học Spring Boot'), srtFile());

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/Vietsub replaced/)).not.toBeInTheDocument();
  });

  it('deletes Vietsub after confirmation', async () => {
    const calls = fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [newer, older] },
      { method: 'DELETE', path: `/api/videos/${ID}/vietsub`, status: 204 },
    ]);
    renderPage();
    const list = await loadedRegion('Manage Vietsub');

    await userEvent.setup().click(within(list).getByRole('button', { name: 'Delete Vietsub: Học Spring Boot' }));
    await answerConfirm('Delete', 'Delete the Vietsub of "Học Spring Boot"?');

    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  describe('pagination', () => {
    it('shows 10 videos per page and moves between pages', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: many(23) }]);
      renderPage();
      const list = await loadedRegion('Manage Vietsub');
      expect(titles(list)).toEqual(many(10).map((v) => v.title));

      await userEvent.setup().click(within(list).getByRole('button', { name: 'Page 3' }));

      expect(titles(list)).toEqual(['Video 21', 'Video 22', 'Video 23']);
      expect(screen.getByLabelText('search')).toHaveTextContent('?page=3');
    });

    it('has no pager for 10 videos or fewer', async () => {
      fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: many(10) }]);
      renderPage();

      const list = await loadedRegion('Manage Vietsub');
      expect(within(list).queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('steps back a page after deleting the only video on the last page', async () => {
      fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: many(11) },
        { method: 'DELETE', path: '/api/videos/VIDEO000011/vietsub', status: 204 },
      ]);
      renderPage('/vietsub?page=2');
      const list = await loadedRegion('Manage Vietsub');
      expect(titles(list)).toEqual(['Video 11']);

      await userEvent.setup().click(within(list).getByRole('button', { name: 'Delete Vietsub: Video 11' }));
      await answerConfirm('Delete');

      await waitFor(() => expect(titles(list)).toHaveLength(10));
      expect(titles(list)[0]).toBe('Video 01');
      expect(within(list).queryByRole('navigation')).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText('search')).toHaveTextContent(/^$/));
    });

    it('goes back to page 1 after replacing, where the replaced video now comes first', async () => {
      const videos = many(12);
      const replaced = { ...videos[11], viCueCount: 9, viUpdatedAt: '2026-11-02T12:00:00Z' };
      fakeFetch([
        { method: 'GET', path: '/api/videos', status: 200, body: videos },
        { method: 'POST', path: '/api/vietsub', status: 200, body: replaced },
      ]);
      renderPage('/vietsub?page=2');
      const list = await loadedRegion('Manage Vietsub');

      await userEvent.setup().upload(within(list).getByLabelText('Replace Vietsub: Video 12'), srtFile());

      await waitFor(() => expect(titles(list)[0]).toBe('Video 12'));
      expect(within(list).getByText('9 lines')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText('search')).toHaveTextContent(/^$/));
    });
  });

  it('keeps Vietsub when deletion is not confirmed', async () => {
    const calls = fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [newer] }]);
    renderPage();
    const list = await loadedRegion('Manage Vietsub');

    await userEvent.setup().click(within(list).getByRole('button', { name: 'Delete Vietsub: Học Spring Boot' }));
    await answerConfirm('Cancel');

    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });
});
