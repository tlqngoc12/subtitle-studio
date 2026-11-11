import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  await userEvent.type(screen.getByLabelText('Post link (Instagram or X)'), 'https://www.instagram.com/p/AAA/');
  await userEvent.type(screen.getByLabelText('Title'), 'Fan meeting');
}

// The date defaults to today: pin it so the saved value is known.
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 9, 12) }));
afterEach(() => vi.useRealTimers());

describe('PhotoPostDialog', () => {
  it('uploads an image pasted with Ctrl+V, resized to 1600', async () => {
    const calls = fakeFetch([UPLOAD]);
    setup();

    fireEvent.paste(screen.getByLabelText('Post link (Instagram or X)'), { clipboardData: { files: [PNG], getData: () => '' } });

    expect(await screen.findByRole('img', { name: 'Selected image' })).toHaveAttribute('src', '/api/media/9');
    expect(calls[0].path).toBe('/api/media?maxSide=1600');
  });

  it('lets text paste into the link field normally', async () => {
    const calls = fakeFetch([UPLOAD]);
    setup();

    await userEvent.click(screen.getByLabelText('Post link (Instagram or X)'));
    await userEvent.paste('https://www.instagram.com/p/AAA/');

    expect(screen.getByLabelText('Post link (Instagram or X)')).toHaveValue('https://www.instagram.com/p/AAA/');
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
      postUrl: 'https://www.instagram.com/p/AAA/',
      mediaId: 9,
      title: 'Fan meeting',
      takenOn: '2026-11-09',
      source: 'FAN',
      photoCount: null,
      profiles: ['emi'],
    });
  });

  it('has no End date and defaults the Date to today', () => {
    setup();

    expect(screen.queryByLabelText(/End date/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toHaveTextContent('09/11/2026');
  });

  it('puts Cancel and Save in one action bar, both medium buttons, Save last', () => {
    setup();

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(cancel).toHaveClass('button');
    expect(cancel).not.toHaveClass('button--s');
    expect(save).toHaveClass('button', 'button--primary');
    expect(save).not.toHaveClass('button--s');
    expect(cancel.parentElement).toBe(save.parentElement);
    expect(save.parentElement?.lastElementChild).toBe(save);
  });

  it('sends the photo count from the stepper and null when it is empty', async () => {
    const calls = fakeFetch([UPLOAD, { method: 'POST', path: '/api/photos', status: 201, body: photo(5) }]);
    setup();
    await fillRequired();
    await userEvent.upload(screen.getByLabelText('Image file'), PNG);
    await screen.findByRole('img', { name: 'Selected image' });
    await userEvent.click(screen.getByRole('button', { name: 'Increase' }));
    await userEvent.click(screen.getByRole('button', { name: 'Increase' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((c) => c.path === '/api/photos')).toBe(true));
    expect(JSON.parse(String(calls.find((c) => c.path === '/api/photos')?.body)).photoCount).toBe(2);
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
    expect(screen.getByLabelText('Post link (Instagram or X)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('pre-fills when editing and keeps the stored image', async () => {
    const existing = photo(12, {
      imageUrl: '/api/media/77',
      title: 'Old',
      takenOn: '2026-11-01',
      source: 'MEDIA',
      photoCount: 4,
      profiles: ['emi'],
    });
    const calls = fakeFetch([{ method: 'PUT', path: '/api/photos/12', status: 200, body: existing }]);
    setup(existing);

    expect(screen.getByLabelText('Title')).toHaveValue('Old');
    expect(screen.getByLabelText('Date')).toHaveTextContent('01/11/2026');
    expect(screen.getByLabelText('Photo count (optional)')).toHaveValue('4');
    expect(screen.getByRole('button', { name: 'Media' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Emi' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(JSON.parse(String(calls[0].body))).toMatchObject({ mediaId: 77, photoCount: 4, profiles: ['emi'] });
  });

  it('picks a day from the calendar opened inside the dialog', async () => {
    setup();

    await userEvent.click(screen.getByLabelText('Date'));
    const grid = await screen.findByRole('grid');
    expect(screen.getByRole('dialog', { name: 'Add post' }).contains(grid)).toBe(false); // portaled out of the dialog, above it
    await userEvent.click(within(grid).getByRole('button', { name: /15/ }));

    expect(screen.getByLabelText('Date')).toHaveTextContent('15/11/2026');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Add post' })).toBeInTheDocument();
  });

  it('has a multi-line title that keeps its line breaks', async () => {
    const calls = fakeFetch([UPLOAD, { method: 'POST', path: '/api/photos', status: 201, body: photo(5) }]);
    setup();
    await userEvent.type(screen.getByLabelText('Post link (Instagram or X)'), 'https://x.com/emi/status/1');
    const title = screen.getByLabelText('Title');
    expect(title.tagName).toBe('TEXTAREA');
    expect(title).toHaveAttribute('rows', '2');
    await userEvent.type(title, 'Line one{Enter}Line two {Enter}');
    await userEvent.upload(screen.getByLabelText('Image file'), PNG);
    await screen.findByRole('img', { name: 'Selected image' });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((c) => c.path === '/api/photos')).toBe(true));
    const body = JSON.parse(String(calls.find((c) => c.path === '/api/photos')?.body));
    expect(body.title).toBe('Line one\nLine two');
    expect(body.postUrl).toBe('https://x.com/emi/status/1');
  });
});
