import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import type { BlockInput } from '../../api/profiles';
import { fakeFetch, problem } from '../../test/fakeFetch';
import { block, item } from '../../test/profileFixtures';
import { BlockEditor } from './BlockEditor';

const PNG = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'a.png', { type: 'image/png' });

function setup(props: Partial<Parameters<typeof BlockEditor>[0]> & Pick<Parameters<typeof BlockEditor>[0], 'type'>) {
  const onSave = vi.fn<(input: BlockInput) => Promise<void>>().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  render(<BlockEditor onSave={onSave} onCancel={onCancel} {...props} />);
  return { onSave, onCancel };
}

describe('BlockEditor', () => {
  it('saves a text block', async () => {
    const { onSave } = setup({ type: 'TEXT' });

    await userEvent.type(screen.getByLabelText('Title'), 'Title');
    await userEvent.type(screen.getByLabelText('Content'), 'Content');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith({
      type: 'TEXT',
      title: 'Title',
      body: 'Content',
      mediaId: null,
      caption: null,
      embedUrl: null,
      items: [],
    });
  });

  it('edits, reorders and removes links', async () => {
    const { onSave } = setup({ type: 'LINKS' });

    await userEvent.click(screen.getByRole('button', { name: 'Add link' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add link' }));
    const names = screen.getAllByLabelText('Link name');
    const urls = screen.getAllByLabelText('URL');
    for (const [i, n] of ['A', 'B', 'C'].entries()) {
      await userEvent.type(names[i], n);
      await userEvent.type(urls[i], `https://${n.toLowerCase()}.example`);
    }
    await userEvent.click(screen.getAllByRole('button', { name: 'Move link up' })[1]);
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete link' })[2]);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave.mock.calls[0][0].items).toEqual([
      { label: 'B', value: 'https://b.example', mediaId: null },
      { label: 'A', value: 'https://a.example', mediaId: null },
    ]);
  });

  it('saves facts', async () => {
    const { onSave } = setup({ type: 'FACTS' });

    await userEvent.click(screen.getByRole('button', { name: 'Add row' }));
    await userEvent.type(screen.getByLabelText('Label'), 'Ngày sinh');
    await userEvent.type(screen.getByLabelText('Value'), '13/05/1999');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave.mock.calls[0][0].items).toEqual([{ label: 'Ngày sinh', value: '13/05/1999', mediaId: null }]);
  });

  it('offers label-only rows for chips', async () => {
    const { onSave } = setup({ type: 'CHIPS' });

    await userEvent.click(screen.getByRole('button', { name: 'Add chip' }));
    await userEvent.type(screen.getByLabelText('Label'), 'Reading');
    expect(screen.queryByLabelText('Value')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave.mock.calls[0][0]).toMatchObject({
      type: 'CHIPS',
      items: [{ label: 'Reading', value: null, mediaId: null }],
    });
  });

  it('uploads an image and disables Save while uploading', async () => {
    let finish!: () => void;
    const delay = new Promise<void>((r) => (finish = r));
    const calls = fakeFetch([{ method: 'POST', path: '/api/media', status: 201, body: { id: 7, url: '/api/media/7' }, delay }]);
    const { onSave } = setup({ type: 'IMAGE' });

    await userEvent.upload(screen.getByLabelText('Choose image'), PNG);

    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/media' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    finish();
    expect(await screen.findByRole('img', { name: 'Selected image' })).toHaveAttribute('src', '/api/media/7');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    await userEvent.type(screen.getByLabelText('Caption'), 'Fan meeting');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ type: 'IMAGE', mediaId: 7, caption: 'Fan meeting', items: [] });
  });

  it('shows an upload error', async () => {
    fakeFetch([{ method: 'POST', path: '/api/media', status: 413, body: problem(413, 'MEDIA_TOO_LARGE', 'x') }]);
    setup({ type: 'IMAGE' });

    await userEvent.upload(screen.getByLabelText('Choose image'), PNG);

    expect(await screen.findByText('Image too large (10 MB max).')).toBeInTheDocument();
  });

  it('adds gallery images with captions', async () => {
    fakeFetch([{ method: 'POST', path: '/api/media', status: 201, body: { id: 8, url: '/api/media/8' } }]);
    const { onSave } = setup({ type: 'GALLERY' });

    await userEvent.click(screen.getByRole('button', { name: 'Add image' }));
    await userEvent.upload(screen.getByLabelText('Choose image'), PNG);
    await screen.findByRole('img', { name: 'Selected image' });
    await userEvent.type(screen.getByLabelText('Image caption'), 'Image 1');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave.mock.calls[0][0].items).toEqual([{ label: 'Image 1', value: null, mediaId: 8 }]);
  });

  it('keeps every gallery change made while uploads are running', async () => {
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    const first = new Promise<void>((r) => (finishFirst = r));
    const second = new Promise<void>((r) => (finishSecond = r));
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        n += 1;
        const id = n;
        await (id === 1 ? first : second);
        return new Response(JSON.stringify({ id, url: `/api/media/${id}` }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const { onSave } = setup({ type: 'GALLERY' });

    await userEvent.click(screen.getByRole('button', { name: 'Add image' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add image' }));
    const pickers = screen.getAllByLabelText('Choose image');
    await userEvent.upload(pickers[0], PNG);
    await userEvent.upload(pickers[1], PNG);
    await userEvent.type(screen.getAllByLabelText('Image caption')[0], 'Một');
    finishFirst();
    await within(screen.getByRole('group', { name: 'Image 1' })).findByRole('img', { name: 'Selected image' });
    finishSecond();
    await within(screen.getByRole('group', { name: 'Image 2' })).findByRole('img', { name: 'Selected image' });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave.mock.calls[0][0].items).toEqual([
      { label: 'Một', value: null, mediaId: 1 },
      { label: null, value: null, mediaId: 2 },
    ]);
  });

  it('marks the inputs the server rejected', async () => {
    const { onSave } = setup({
      type: 'LINKS',
      initial: block({ id: 3, type: 'LINKS', items: [item({ label: 'X', value: 'ftp://x' })] }),
    });
    onSave.mockRejectedValue(
      new ApiError(400, 'INVALID_BLOCK', 'x', [
        { field: 'items[0].value', message: 'Links must start with http:// or https://' },
      ]),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Links must start with http:// or https://')).toBeInTheDocument();
    expect(screen.getByLabelText('URL')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Some block fields are not valid.');
  });

  it('prefills an existing block and cancels', async () => {
    const { onCancel } = setup({
      type: 'EMBED',
      initial: block({ id: 3, type: 'EMBED', title: 'MV', embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' }),
    });

    expect(screen.getByLabelText('Title')).toHaveValue('MV');
    expect(screen.getByLabelText('YouTube or Spotify link')).toHaveValue(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('keeps the existing image of a gallery item', async () => {
    const { onSave } = setup({
      type: 'GALLERY',
      initial: block({ id: 3, type: 'GALLERY', items: [item({ label: 'A', mediaId: 5, mediaUrl: '/api/media/5' })] }),
    });

    const row = screen.getByRole('group', { name: 'Image 1' });
    expect(within(row).getByRole('img', { name: 'Selected image' })).toHaveAttribute('src', '/api/media/5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].items).toEqual([{ label: 'A', value: null, mediaId: 5 }]);
  });
});
