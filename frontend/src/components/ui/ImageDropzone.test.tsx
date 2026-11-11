import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageDropzone } from './ImageDropzone';

const uploadMedia = vi.fn();
vi.mock('../../api/profiles', () => ({ uploadMedia: (...args: unknown[]) => uploadMedia(...args) }));

const PNG = new File(['x'], 'a.png', { type: 'image/png' });
const MEDIA = { id: 7, url: '/api/media/7', width: 100, height: 80 };

beforeEach(() => {
  uploadMedia.mockReset();
  uploadMedia.mockResolvedValue(MEDIA);
});

function renderOne(props: Partial<Parameters<typeof ImageDropzone>[0]> = {}) {
  const onUploaded = vi.fn();
  render(<ImageDropzone label="Cover" value={null} aspect="4/5" onUploaded={onUploaded} {...props} />);
  return onUploaded;
}

describe('ImageDropzone', () => {
  it('uploads a chosen file at 1600 by default and reports the media', async () => {
    const onUploaded = renderOne();
    await userEvent.upload(screen.getByLabelText('Cover file'), PNG);
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(MEDIA));
    expect(uploadMedia).toHaveBeenCalledWith(PNG, 1600);
  });

  it('uses the given maxSide', async () => {
    renderOne({ maxSide: 400 });
    await userEvent.upload(screen.getByLabelText('Cover file'), PNG);
    await waitFor(() => expect(uploadMedia).toHaveBeenCalledWith(PNG, 400));
  });

  it('uploads a dropped image', async () => {
    const onUploaded = renderOne();
    fireEvent.drop(screen.getByRole('group', { name: 'Cover' }), { dataTransfer: { files: [PNG] } });
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(MEDIA));
  });

  it('rejects a non-image file with an inline message and does not upload', async () => {
    renderOne();
    fireEvent.drop(screen.getByRole('group', { name: 'Cover' }), {
      dataTransfer: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Use a JPEG, PNG or WebP image.');
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it('pastes an image when focus is inside it', async () => {
    const onUploaded = renderOne();
    const choose = screen.getByRole('button', { name: 'Choose image' });
    choose.focus();
    fireEvent.paste(choose, { clipboardData: { files: [PNG], getData: () => '' } });
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(MEDIA));
  });

  it('with two dropzones, a paste goes only to the one that has focus', async () => {
    const a = vi.fn();
    const b = vi.fn();
    render(
      <>
        <ImageDropzone label="First" value={null} aspect="1/1" onUploaded={a} />
        <ImageDropzone label="Second" value={null} aspect="1/1" onUploaded={b} />
      </>,
    );
    const second = screen.getAllByRole('button', { name: 'Choose image' })[1];
    second.focus();
    fireEvent.paste(second, { clipboardData: { files: [PNG], getData: () => '' } });
    await waitFor(() => expect(b).toHaveBeenCalledTimes(1));
    expect(a).not.toHaveBeenCalled();
    expect(uploadMedia).toHaveBeenCalledTimes(1);
  });

  it('ignores a paste outside it and outside its dialog', () => {
    renderOne();
    render(<input aria-label="elsewhere" />);
    fireEvent.paste(screen.getByLabelText('elsewhere'), { clipboardData: { files: [PNG], getData: () => '' } });
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it('takes a paste from anywhere inside the dialog that contains it, but not from a sibling dropzone', async () => {
    const inside = vi.fn();
    render(
      <>
        <div role="dialog" aria-label="Dialog">
          <input aria-label="link" />
          <ImageDropzone label="Avatar" value={null} aspect="1/1" onUploaded={inside} />
        </div>
        <ImageDropzone label="Cover" value={null} aspect="4/5" onUploaded={() => {}} />
      </>,
    );
    fireEvent.paste(screen.getByLabelText('link'), { clipboardData: { files: [PNG], getData: () => '' } });
    await waitFor(() => expect(inside).toHaveBeenCalledTimes(1));
    expect(uploadMedia).toHaveBeenCalledTimes(1);
  });

  it('lets text paste through', () => {
    renderOne();
    const choose = screen.getByRole('button', { name: 'Choose image' });
    fireEvent.paste(choose, { clipboardData: { files: [], getData: () => 'https://x' } });
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it('shows the preview with Replace and Remove', async () => {
    const onRemove = vi.fn();
    const onUploaded = renderOne({ value: { url: '/api/media/3' }, onRemove });
    expect(screen.getByRole('img', { name: 'Selected image' })).toHaveAttribute('src', '/api/media/3');
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalled();
    await userEvent.upload(screen.getByLabelText('Cover file'), PNG);
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
  });

  it('has no Remove button without onRemove', () => {
    renderOne({ value: { url: '/api/media/3' } });
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('disables the buttons while uploading and reports busy', async () => {
    let finish!: (m: typeof MEDIA) => void;
    uploadMedia.mockReturnValue(new Promise((r) => (finish = r)));
    const onBusyChange = vi.fn();
    renderOne({ onBusyChange });
    await userEvent.upload(screen.getByLabelText('Cover file'), PNG);
    expect(screen.getByRole('button', { name: 'Choose image' })).toBeDisabled();
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    finish(MEDIA);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose image' })).toBeEnabled());
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('shows an upload failure inline', async () => {
    uploadMedia.mockRejectedValue(new Error('boom'));
    renderOne();
    await userEvent.upload(screen.getByLabelText('Cover file'), PNG);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
