import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeFetch, problem, type Route } from '../../test/fakeFetch';
import { photo } from '../../test/photoFixtures';
import { PhotoPostDialog } from './PhotoPostDialog';

const PEOPLE = [
  { slug: 'emibonnie', name: 'EmiBonnie', avatarUrl: null },
  { slug: 'emi', name: 'Emi', avatarUrl: null },
];
const UPLOAD: Route = {
  method: 'POST',
  path: '/api/media?maxSide=1600',
  status: 201,
  body: { id: 9, url: '/api/media/9', width: 1080, height: 1350 },
};
const PNG = new File(['x'], 'a.png', { type: 'image/png' });

function setup(post?: ReturnType<typeof photo>) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  render(<PhotoPostDialog open post={post} people={PEOPLE} onSaved={onSaved} onOpenChange={onOpenChange} />);
  return { onSaved, onOpenChange };
}

async function fillRequired() {
  await userEvent.type(screen.getByLabelText('Instagram link'), 'https://www.instagram.com/p/AAA/');
  await userEvent.type(screen.getByLabelText('Title'), 'Fan meeting');
  await userEvent.type(screen.getByLabelText('Date'), '2026-11-09');
}

describe('PhotoPostDialog', () => {
  it('uploads an image pasted with Ctrl+V, resized to 1600', async () => {
    const calls = fakeFetch([UPLOAD]);
    setup();

    fireEvent.paste(screen.getByLabelText('Instagram link'), { clipboardData: { files: [PNG], getData: () => '' } });

    expect(await screen.findByRole('img', { name: 'Selected image' })).toHaveAttribute('src', '/api/media/9');
    expect(calls[0].path).toBe('/api/media?maxSide=1600');
  });

  it('lets text paste into the link field normally', async () => {
    const calls = fakeFetch([UPLOAD]);
    setup();

    await userEvent.click(screen.getByLabelText('Instagram link'));
    await userEvent.paste('https://www.instagram.com/p/AAA/');

    expect(screen.getByLabelText('Instagram link')).toHaveValue('https://www.instagram.com/p/AAA/');
    expect(calls).toHaveLength(0);
  });

  it('uploads a chosen file and disables Save meanwhile', async () => {
    let finish!: () => void;
    const delay = new Promise<void>((r) => (finish = r));
    fakeFetch([{ ...UPLOAD, delay }]);
    setup();

    await userEvent.upload(screen.getByLabelText('Image file'), PNG);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText('Uploading…')).toBeInTheDocument();
    finish();
    await screen.findByRole('img', { name: 'Selected image' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('saves the post with profile slugs and a null photo count when blank', async () => {
    const created = photo(5);
    const calls = fakeFetch([UPLOAD, { method: 'POST', path: '/api/photos', status: 201, body: created }]);
    const { onSaved } = setup();

    await fillRequired();
    await userEvent.upload(screen.getByLabelText('Image file'), PNG);
    await screen.findByRole('img', { name: 'Selected image' });
    await userEvent.click(screen.getByRole('button', { name: 'Fan' }));
    await userEvent.click(screen.getByRole('button', { name: 'Emi' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(created));
    const post = calls.find((c) => c.path === '/api/photos');
    expect(JSON.parse(String(post?.body))).toEqual({
      instagramUrl: 'https://www.instagram.com/p/AAA/',
      mediaId: 9,
      title: 'Fan meeting',
      takenOn: '2026-11-09',
      takenUntil: null,
      source: 'FAN',
      photoCount: null,
      profiles: ['emi'],
    });
  });

  it('asks for an image before saving', async () => {
    const calls = fakeFetch([]);
    setup();

    await fillRequired();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Choose an image first')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('shows the duplicate message under the link', async () => {
    fakeFetch([
      UPLOAD,
      {
        method: 'POST',
        path: '/api/photos',
        status: 409,
        body: problem(409, 'PHOTO_POST_EXISTS', 'This post is already added as “Old title”.'),
      },
    ]);
    setup();

    await fillRequired();
    await userEvent.upload(screen.getByLabelText('Image file'), PNG);
    await screen.findByRole('img', { name: 'Selected image' });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('This post is already added as “Old title”.')).toBeInTheDocument();
    expect(screen.getByLabelText('Instagram link')).toHaveAttribute('aria-invalid', 'true');
  });

  it('pre-fills when editing and keeps the stored image', async () => {
    const existing = photo(12, {
      imageUrl: '/api/media/77',
      title: 'Old',
      takenOn: '2026-11-01',
      takenUntil: '2026-11-02',
      source: 'MEDIA',
      photoCount: 4,
      profiles: ['emi'],
    });
    const calls = fakeFetch([{ method: 'PUT', path: '/api/photos/12', status: 200, body: existing }]);
    setup(existing);

    expect(screen.getByLabelText('Title')).toHaveValue('Old');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-01');
    expect(screen.getByLabelText('Photo count (optional)')).toHaveValue(4);
    expect(screen.getByRole('button', { name: 'Media' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Emi' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(String(calls[0].body))).toMatchObject({ mediaId: 77, photoCount: 4, profiles: ['emi'] });
  });
});
