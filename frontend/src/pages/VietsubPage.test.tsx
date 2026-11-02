import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoDto } from '../api/client';
import { NavBar } from '../components/NavBar';
import { fakeFetch, problem } from '../test/fakeFetch';
import VietsubPage from './VietsubPage';

const ID = 'dQw4w9WgXcQ';

function video(id: string, title: string, viCueCount: number, viUpdatedAt: string | null): VideoDto {
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
  };
}

const none = video('NONE0000001', 'Chưa có Vietsub', 0, null);
const older = video('OLDER000001', 'Video cũ hơn', 5, '2026-11-02T10:00:00Z');
const newer = video(ID, 'Học Spring Boot', 7, '2026-11-02T11:00:00Z');

function WatchStub() {
  const { id } = useParams();
  return <p>watch {id}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/vietsub']}>
      <NavBar />
      <Routes>
        <Route path="/vietsub" element={<VietsubPage />} />
        <Route path="/vietsub/:id" element={<WatchStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

const srtFile = () => new File(['1\n00:00:01,000 --> 00:00:02,000\nXin chào\n'], 'vi.srt', { type: 'application/x-subrip' });

async function fillForm(url: string, file?: File) {
  const user = userEvent.setup();
  if (url) await user.type(screen.getByLabelText('Link YouTube'), url);
  if (file) await user.upload(screen.getByLabelText('File Vietsub (.srt)'), file);
  await user.click(screen.getByRole('button', { name: 'Thêm Vietsub' }));
  return user;
}

describe('VietsubPage', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('shows the nav with Vietsub as current page', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [] }]);
    renderPage();

    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: 'Vietsub' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Lấy Engsub' })).toHaveAttribute('href', '/');
  });

  it('manages only videos with Vietsub, newest update first', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [none, older, newer] }]);
    renderPage();

    const list = await screen.findByRole('region', { name: 'Quản lý Vietsub' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Học Spring Boot')).toBeInTheDocument();
    expect(within(items[0]).getByText('7 câu')).toBeInTheDocument();
    // Management list only: watching happens from /vietsub/list (the only link is the download).
    expect(within(list).queryByRole('link', { name: /^Xem/ })).not.toBeInTheDocument();
    expect(within(items[1]).getByText('Video cũ hơn')).toBeInTheDocument();
  });

  it('invites the user when no video has Vietsub', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [none] }]);
    renderPage();

    expect(await screen.findByText(/Chưa có video nào có Vietsub/)).toBeInTheDocument();
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

    expect(screen.getByRole('button', { name: 'Đang thêm…' })).toBeDisabled();
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
    expect(alert).toHaveTextContent('Không đọc được file .srt');
    expect(alert).toHaveTextContent('Block 3 is longer than 1000 characters');
  });

  it('offers Replace, Delete and Download for each video', async () => {
    fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [newer] }]);
    renderPage();
    const list = await screen.findByRole('region', { name: 'Quản lý Vietsub' });
    const item = within(list).getByRole('listitem');

    // Replace and Delete are icon buttons with tooltips.
    const replace = within(item).getByLabelText('Replace Vietsub: Học Spring Boot').closest('label')!;
    const remove = within(item).getByRole('button', { name: 'Delete Vietsub: Học Spring Boot' });
    for (const [el, tip] of [[replace, 'Replace Vietsub'], [remove, 'Delete Vietsub']] as const) {
      expect(el).toHaveAttribute('title', tip);
      expect(el.textContent?.trim()).toBe('');
      expect(el.querySelector('svg')).not.toBeNull();
    }
    const download = within(item).getByRole('link', { name: 'Download Vietsub: Học Spring Boot' });
    expect(download).toHaveAttribute('title', 'Download Vietsub');
    expect(download.textContent?.trim()).toBe('');
    expect(download.querySelector('svg')).not.toBeNull();
    expect(download).toHaveAttribute('href', `/api/videos/${ID}/subtitle.vi.srt`);
    expect(download).toHaveAttribute('download');
  });

  it('replaces Vietsub from the list', async () => {
    const replaced = { ...newer, viCueCount: 9, viUpdatedAt: '2026-11-02T12:00:00Z' };
    const calls = fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [newer] },
      { method: 'POST', path: '/api/vietsub', status: 200, body: replaced },
    ]);
    renderPage();
    const list = await screen.findByRole('region', { name: 'Quản lý Vietsub' });

    await userEvent.setup().upload(within(list).getByLabelText('Replace Vietsub: Học Spring Boot'), srtFile());

    expect(await within(list).findByText('9 câu')).toBeInTheDocument();
    expect((calls.find((c) => c.method === 'POST')!.body as FormData).get('url')).toBe(ID);
  });

  it('deletes Vietsub after confirmation', async () => {
    const calls = fakeFetch([
      { method: 'GET', path: '/api/videos', status: 200, body: [newer, older] },
      { method: 'DELETE', path: `/api/videos/${ID}/vietsub`, status: 204 },
    ]);
    renderPage();
    const list = await screen.findByRole('region', { name: 'Quản lý Vietsub' });

    await userEvent.setup().click(within(list).getByRole('button', { name: 'Delete Vietsub: Học Spring Boot' }));

    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
    expect(window.confirm).toHaveBeenCalled();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('keeps Vietsub when deletion is not confirmed', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const calls = fakeFetch([{ method: 'GET', path: '/api/videos', status: 200, body: [newer] }]);
    renderPage();
    const list = await screen.findByRole('region', { name: 'Quản lý Vietsub' });

    await userEvent.setup().click(within(list).getByRole('button', { name: 'Delete Vietsub: Học Spring Boot' }));

    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  });
});
