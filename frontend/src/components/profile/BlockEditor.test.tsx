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

    await userEvent.type(screen.getByLabelText('Tiêu đề'), 'Tiêu đề');
    await userEvent.type(screen.getByLabelText('Nội dung'), 'Nội dung');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(onSave).toHaveBeenCalledWith({
      type: 'TEXT',
      title: 'Tiêu đề',
      body: 'Nội dung',
      mediaId: null,
      caption: null,
      embedUrl: null,
      items: [],
    });
  });

  it('edits, reorders and removes links', async () => {
    const { onSave } = setup({ type: 'LINKS' });

    await userEvent.click(screen.getByRole('button', { name: 'Thêm link' }));
    await userEvent.click(screen.getByRole('button', { name: 'Thêm link' }));
    await userEvent.click(screen.getByRole('button', { name: 'Thêm link' }));
    const names = screen.getAllByLabelText('Tên link');
    const urls = screen.getAllByLabelText('Link');
    for (const [i, n] of ['A', 'B', 'C'].entries()) {
      await userEvent.type(names[i], n);
      await userEvent.type(urls[i], `https://${n.toLowerCase()}.example`);
    }
    await userEvent.click(screen.getAllByRole('button', { name: 'Di chuyển link lên' })[1]);
    await userEvent.click(screen.getAllByRole('button', { name: 'Xóa link' })[2]);
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(onSave.mock.calls[0][0].items).toEqual([
      { label: 'B', value: 'https://b.example', mediaId: null },
      { label: 'A', value: 'https://a.example', mediaId: null },
    ]);
  });

  it('saves facts', async () => {
    const { onSave } = setup({ type: 'FACTS' });

    await userEvent.click(screen.getByRole('button', { name: 'Thêm dòng' }));
    await userEvent.type(screen.getByLabelText('Nhãn'), 'Ngày sinh');
    await userEvent.type(screen.getByLabelText('Giá trị'), '13/05/1999');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(onSave.mock.calls[0][0].items).toEqual([{ label: 'Ngày sinh', value: '13/05/1999', mediaId: null }]);
  });

  it('uploads an image and disables Lưu while uploading', async () => {
    let finish!: () => void;
    const delay = new Promise<void>((r) => (finish = r));
    const calls = fakeFetch([{ method: 'POST', path: '/api/media', status: 201, body: { id: 7, url: '/api/media/7' }, delay }]);
    const { onSave } = setup({ type: 'IMAGE' });

    await userEvent.upload(screen.getByLabelText('Chọn ảnh'), PNG);

    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/media' });
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
    finish();
    expect(await screen.findByRole('img', { name: 'Ảnh đã chọn' })).toHaveAttribute('src', '/api/media/7');
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeEnabled();

    await userEvent.type(screen.getByLabelText('Chú thích'), 'Fan meeting');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(onSave.mock.calls[0][0]).toMatchObject({ type: 'IMAGE', mediaId: 7, caption: 'Fan meeting', items: [] });
  });

  it('shows an upload error', async () => {
    fakeFetch([{ method: 'POST', path: '/api/media', status: 413, body: problem(413, 'MEDIA_TOO_LARGE', 'x') }]);
    setup({ type: 'IMAGE' });

    await userEvent.upload(screen.getByLabelText('Chọn ảnh'), PNG);

    expect(await screen.findByText('Ảnh quá lớn (tối đa 10 MB).')).toBeInTheDocument();
  });

  it('adds gallery images with captions', async () => {
    fakeFetch([{ method: 'POST', path: '/api/media', status: 201, body: { id: 8, url: '/api/media/8' } }]);
    const { onSave } = setup({ type: 'GALLERY' });

    await userEvent.click(screen.getByRole('button', { name: 'Thêm ảnh' }));
    await userEvent.upload(screen.getByLabelText('Chọn ảnh'), PNG);
    await screen.findByRole('img', { name: 'Ảnh đã chọn' });
    await userEvent.type(screen.getByLabelText('Chú thích ảnh'), 'Ảnh 1');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(onSave.mock.calls[0][0].items).toEqual([{ label: 'Ảnh 1', value: null, mediaId: 8 }]);
  });

  it('marks the inputs the server rejected', async () => {
    const { onSave } = setup({
      type: 'LINKS',
      initial: block({ id: 3, type: 'LINKS', items: [item({ label: 'X', value: 'ftp://x' })] }),
    });
    onSave.mockRejectedValue(
      new ApiError(400, 'INVALID_BLOCK', 'x', [
        { field: 'items[0].value', message: 'Link phải bắt đầu bằng http:// hoặc https://' },
      ]),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(await screen.findByText('Link phải bắt đầu bằng http:// hoặc https://')).toBeInTheDocument();
    expect(screen.getByLabelText('Link')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Nội dung khối chưa hợp lệ.');
  });

  it('prefills an existing block and cancels', async () => {
    const { onCancel } = setup({
      type: 'EMBED',
      initial: block({ id: 3, type: 'EMBED', title: 'MV', embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' }),
    });

    expect(screen.getByLabelText('Tiêu đề')).toHaveValue('MV');
    expect(screen.getByLabelText('Link YouTube hoặc Spotify')).toHaveValue(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('keeps the existing image of a gallery item', async () => {
    const { onSave } = setup({
      type: 'GALLERY',
      initial: block({ id: 3, type: 'GALLERY', items: [item({ label: 'A', mediaId: 5, mediaUrl: '/api/media/5' })] }),
    });

    const row = screen.getByRole('group', { name: 'Ảnh 1' });
    expect(within(row).getByRole('img', { name: 'Ảnh đã chọn' })).toHaveAttribute('src', '/api/media/5');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].items).toEqual([{ label: 'A', value: null, mediaId: 5 }]);
  });
});
