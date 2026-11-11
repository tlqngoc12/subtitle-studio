import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BannerImage } from '../../api/profiles';
import { answerConfirm } from '../../test/confirm';
import { css } from '../../test/css';
import { fakeFetch, problem, type Call, type Route } from '../../test/fakeFetch';
import { BannerEditor } from './BannerEditor';

const A: BannerImage = { id: 1, mediaUrl: '/api/media/11', altText: 'Fan meeting' };
const B: BannerImage = { id: 2, mediaUrl: '/api/media/12', altText: null };
const C: BannerImage = { id: 3, mediaUrl: '/api/media/13', altText: 'Backstage' };

const UPLOAD: Route = { method: 'POST', path: '/api/media?maxSide=1600', status: 201, body: { id: 50, url: '/api/media/50' } };
const NEW: BannerImage = { id: 9, mediaUrl: '/api/media/50', altText: null };

function many(n: number): BannerImage[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, mediaUrl: `/api/media/${i + 10}`, altText: null }));
}

/** Holds the list like ProfilePage does and records every list handed to onChange. */
function renderEditor(initial: BannerImage[], routes: Route[] = []) {
  const calls = fakeFetch(routes);
  const lists: BannerImage[][] = [];
  function Harness() {
    const [images, setImages] = useState(initial);
    return (
      <BannerEditor
        slug="emi"
        images={images}
        onChange={(next) => {
          lists.push(next);
          setImages(next);
        }}
      />
    );
  }
  render(<Harness />);
  return { calls, lists };
}

const bodyOf = (calls: Call[], method: string, path: string) =>
  JSON.parse(String(calls.find((c) => c.method === method && c.path === path)?.body));

async function chooseFile(user: ReturnType<typeof userEvent.setup>, name = 'a.png') {
  await user.upload(screen.getByLabelText('Banner image file'), new File(['x'], name, { type: 'image/png' }));
  await screen.findByAltText('Selected image');
}

afterEach(() => vi.unstubAllGlobals());

describe('BannerEditor', () => {
  it('shows the heading, the thumbnails in order and each description', () => {
    renderEditor([A, B, C]);

    expect(screen.getByRole('heading', { name: 'Banner' })).toBeInTheDocument();
    const grid = screen.getByRole('list', { name: 'Banner images' });
    const items = within(grid).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByRole('textbox', { name: 'Description of image 1' })).toHaveValue('Fan meeting');
    expect(within(items[1]).getByRole('textbox', { name: 'Description of image 2' })).toHaveValue('');
    expect(within(items[2]).getByRole('textbox', { name: 'Description of image 3' })).toHaveValue('Backstage');
    expect(items[0].querySelector('img')).toHaveAttribute('src', '/api/media/11');
  });

  it('says what the description is for', () => {
    renderEditor([]);

    expect(screen.getByLabelText('Image description (optional)')).toBeInTheDocument();
    expect(screen.getByText('Read by screen readers; not shown on the page.')).toBeInTheDocument();
  });

  describe('add', () => {
    it('keeps Add disabled until a file is chosen', async () => {
      const user = userEvent.setup();
      renderEditor([A], [UPLOAD]);
      expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();

      await chooseFile(user);

      expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
    });

    it('adds an image without a description (sent as null)', async () => {
      const user = userEvent.setup();
      const { calls, lists } = renderEditor([A], [
        UPLOAD,
        { method: 'POST', path: '/api/profiles/emi/banner', status: 201, body: [A, NEW] },
      ]);
      await chooseFile(user);

      await user.click(screen.getByRole('button', { name: 'Add' }));

      await waitFor(() => expect(lists).toEqual([[A, NEW]]));
      expect(bodyOf(calls, 'POST', '/api/profiles/emi/banner')).toEqual({ mediaId: 50, altText: null });
      // The form resets for the next image.
      expect(screen.queryByAltText('Selected image')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    it('adds an image with a description', async () => {
      const user = userEvent.setup();
      const added = { ...NEW, altText: 'Photo shoot' };
      const { calls } = renderEditor([], [
        UPLOAD,
        { method: 'POST', path: '/api/profiles/emi/banner', status: 201, body: [added] },
      ]);
      await chooseFile(user);
      await user.type(screen.getByLabelText('Image description (optional)'), '  Photo shoot ');

      await user.click(screen.getByRole('button', { name: 'Add' }));

      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
      expect(bodyOf(calls, 'POST', '/api/profiles/emi/banner')).toEqual({ mediaId: 50, altText: 'Photo shoot' });
      expect(screen.getByLabelText('Image description (optional)')).toHaveValue('');
    });

    it('turns the whole flow off with a hint when there are 8 images', () => {
      renderEditor(many(8));

      expect(screen.getByText('Up to 8 images')).toBeInTheDocument();
      expect(screen.getByLabelText('Banner image file')).toBeDisabled();
      expect(screen.getByLabelText('Image description (optional)')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    });

    it('shows no limit hint below 8 and allows the 8th image', () => {
      renderEditor(many(7));

      expect(screen.queryByText('Up to 8 images')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Banner image file')).toBeEnabled();
    });

    it('shows a description error under the field and keeps the form', async () => {
      const user = userEvent.setup();
      const { lists } = renderEditor([], [
        UPLOAD,
        {
          method: 'POST',
          path: '/api/profiles/emi/banner',
          status: 400,
          body: { ...problem(400, 'INVALID_BLOCK', 'x'), errors: [{ field: 'altText', message: 'Use at most 200 characters.' }] },
        },
      ]);
      await chooseFile(user);
      await user.type(screen.getByLabelText('Image description (optional)'), 'too long');

      await user.click(screen.getByRole('button', { name: 'Add' }));

      const field = screen.getByLabelText('Image description (optional)');
      expect(await screen.findByText('Use at most 200 characters.')).toBeInTheDocument();
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveValue('too long');
      expect(screen.getByAltText('Selected image')).toBeInTheDocument();
      expect(lists).toEqual([]);
    });

    it('shows other rejections in an alert', async () => {
      const user = userEvent.setup();
      renderEditor([], [
        UPLOAD,
        {
          method: 'POST',
          path: '/api/profiles/emi/banner',
          status: 400,
          body: { ...problem(400, 'INVALID_BLOCK', 'x'), errors: [{ field: 'banner', message: 'A banner holds up to 8 images.' }] },
        },
      ]);
      await chooseFile(user);

      await user.click(screen.getByRole('button', { name: 'Add' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('A banner holds up to 8 images.');
    });

    it('shows the existing media error when the upload fails', async () => {
      const user = userEvent.setup();
      renderEditor([], [{ method: 'POST', path: '/api/media?maxSide=1600', status: 400, body: problem(400, 'INVALID_MEDIA', 'x') }]);

      await user.upload(screen.getByLabelText('Banner image file'), new File(['x'], 'fake.png', { type: 'image/png' }));

      expect(await screen.findByText('The file is not a JPEG, PNG, WebP or GIF image.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    });
  });

  describe('description', () => {
    it('saves a changed description on blur', async () => {
      const user = userEvent.setup();
      const { calls, lists } = renderEditor([A, B], [
        { method: 'PUT', path: '/api/profiles/emi/banner/1', status: 200, body: [{ ...A, altText: 'New text' }, B] },
      ]);
      const field = screen.getByRole('textbox', { name: 'Description of image 1' });

      await user.clear(field);
      await user.type(field, '  New text ');
      await user.tab();

      await waitFor(() => expect(lists).toHaveLength(1));
      expect(bodyOf(calls, 'PUT', '/api/profiles/emi/banner/1')).toEqual({ altText: 'New text' });
      expect(lists[0][0].altText).toBe('New text');
    });

    it('saves on Enter', async () => {
      const user = userEvent.setup();
      const { calls } = renderEditor([B], [
        { method: 'PUT', path: '/api/profiles/emi/banner/2', status: 200, body: [{ ...B, altText: 'Hello' }] },
      ]);

      await user.type(screen.getByRole('textbox', { name: 'Description of image 1' }), 'Hello{Enter}');

      await waitFor(() => expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1));
      expect(bodyOf(calls, 'PUT', '/api/profiles/emi/banner/2')).toEqual({ altText: 'Hello' });
    });

    it('clears the description when emptied (sent as null)', async () => {
      const user = userEvent.setup();
      const { calls, lists } = renderEditor([A], [
        { method: 'PUT', path: '/api/profiles/emi/banner/1', status: 200, body: [{ ...A, altText: null }] },
      ]);

      await user.clear(screen.getByRole('textbox', { name: 'Description of image 1' }));
      await user.tab();

      await waitFor(() => expect(lists).toHaveLength(1));
      expect(bodyOf(calls, 'PUT', '/api/profiles/emi/banner/1')).toEqual({ altText: null });
      expect(lists[0][0].altText).toBeNull();
    });

    it('does not call the server when nothing changed', async () => {
      const user = userEvent.setup();
      const { calls } = renderEditor([A]);
      const field = screen.getByRole('textbox', { name: 'Description of image 1' });

      await user.click(field);
      await user.type(field, ' ');
      await user.clear(field);
      await user.type(field, 'Fan meeting');
      await user.tab();

      expect(calls).toEqual([]);
    });

    it('shows the validation error under the field and keeps what was typed', async () => {
      const user = userEvent.setup();
      const { lists } = renderEditor([A], [
        {
          method: 'PUT',
          path: '/api/profiles/emi/banner/1',
          status: 400,
          body: { ...problem(400, 'INVALID_BLOCK', 'x'), errors: [{ field: 'altText', message: 'Use at most 200 characters.' }] },
        },
      ]);
      const field = screen.getByRole('textbox', { name: 'Description of image 1' });

      await user.type(field, ' and more');
      await user.tab();

      expect(await screen.findByText('Use at most 200 characters.')).toBeInTheDocument();
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveValue('Fan meeting and more');
      expect(lists).toEqual([]);
    });
  });

  describe('reorder', () => {
    it('moves an image right with its button, saves the order and disables the edge buttons', async () => {
      const user = userEvent.setup();
      const { calls } = renderEditor([A, B, C], [
        { method: 'PUT', path: '/api/profiles/emi/banner/order', status: 200, body: [B, A, C] },
      ]);
      expect(screen.getByRole('button', { name: 'Move image 1 left' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Move image 3 right' })).toBeDisabled();

      await user.click(screen.getByRole('button', { name: 'Move image 1 right' }));

      await waitFor(() => expect(bodyOf(calls, 'PUT', '/api/profiles/emi/banner/order')).toEqual({ imageIds: [2, 1, 3] }));
      const boxes = screen.getAllByRole('textbox', { name: /^Description of image/ });
      expect(boxes.map((b) => (b as HTMLInputElement).value)).toEqual(['', 'Fan meeting', 'Backstage']);
    });

    it('moves an image left', async () => {
      const user = userEvent.setup();
      const { calls } = renderEditor([A, B, C], [
        { method: 'PUT', path: '/api/profiles/emi/banner/order', status: 200, body: [A, C, B] },
      ]);

      await user.click(screen.getByRole('button', { name: 'Move image 3 left' }));

      await waitFor(() => expect(bodyOf(calls, 'PUT', '/api/profiles/emi/banner/order')).toEqual({ imageIds: [1, 3, 2] }));
    });

    it('applies the new order at once, before the server answers', async () => {
      const user = userEvent.setup();
      let release!: () => void;
      const delay = new Promise<void>((r) => (release = r));
      const { lists } = renderEditor([A, B], [
        { method: 'PUT', path: '/api/profiles/emi/banner/order', status: 200, body: [B, A], delay },
      ]);

      await user.click(screen.getByRole('button', { name: 'Move image 1 right' }));

      expect(lists[0]).toEqual([B, A]);
      release();
      await waitFor(() => expect(lists).toHaveLength(2));
    });

    it('reverts the order and shows an alert when saving fails', async () => {
      const user = userEvent.setup();
      const { lists } = renderEditor([A, B, C], [
        { method: 'PUT', path: '/api/profiles/emi/banner/order', status: 500, body: problem(500, 'INTERNAL_ERROR', 'boom') },
      ]);

      await user.click(screen.getByRole('button', { name: 'Move image 1 right' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('The server ran into an error.');
      expect(lists).toEqual([[B, A, C], [A, B, C]]);
      const boxes = screen.getAllByRole('textbox', { name: /^Description of image/ });
      expect(boxes.map((b) => (b as HTMLInputElement).value)).toEqual(['Fan meeting', '', 'Backstage']);
    });

    it('reverts when the server rejects the list (400)', async () => {
      const user = userEvent.setup();
      const { lists } = renderEditor([A, B], [
        {
          method: 'PUT',
          path: '/api/profiles/emi/banner/order',
          status: 400,
          body: { ...problem(400, 'INVALID_BLOCK', 'x'), errors: [{ field: 'imageIds', message: 'List every banner image of this profile exactly once.' }] },
        },
      ]);

      await user.click(screen.getByRole('button', { name: 'Move image 1 right' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('List every banner image of this profile exactly once.');
      expect(lists[lists.length - 1]).toEqual([A, B]);
    });

    describe('drag and drop', () => {
      // jsdom has no layout; give each thumbnail a box so dnd-kit's keyboard sensor can find the next one.
      let spy: ReturnType<typeof vi.spyOn>;
      beforeEach(() => {
        spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
          const li = this.closest('li');
          const index = li?.parentElement ? Array.from(li.parentElement.children).indexOf(li) : 0;
          const left = index * 160;
          return { x: left, y: 0, top: 0, left, right: left + 150, bottom: 150, width: 150, height: 150, toJSON() {} } as DOMRect;
        });
      });
      afterEach(() => spy.mockRestore());

      it('reorders with the keyboard (Space, ArrowRight, Space)', async () => {
        const { calls } = renderEditor([A, B, C], [
          { method: 'PUT', path: '/api/profiles/emi/banner/order', status: 200, body: [B, A, C] },
        ]);
        const handle = screen.getByRole('button', { name: 'Drag to reorder: image 1' });

        // dnd-kit attaches its keyboard listeners in a setTimeout after the drag starts.
        const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));
        handle.focus();
        fireEvent.keyDown(handle, { key: ' ', code: 'Space' });
        await tick();
        fireEvent.keyDown(document.activeElement ?? handle, { key: 'ArrowRight', code: 'ArrowRight' });
        await tick();
        fireEvent.keyDown(document.activeElement ?? handle, { key: ' ', code: 'Space' });

        await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
        expect(bodyOf(calls, 'PUT', '/api/profiles/emi/banner/order')).toEqual({ imageIds: [2, 1, 3] });
      });
    });
  });

  describe('delete', () => {
    it('asks first and deletes after Delete', async () => {
      const user = userEvent.setup();
      const { calls, lists } = renderEditor([A, B], [
        { method: 'DELETE', path: '/api/profiles/emi/banner/1', status: 200, body: [B] },
      ]);

      await user.click(screen.getByRole('button', { name: 'Delete image 1' }));
      await answerConfirm('Delete', 'Delete this image?');

      await waitFor(() => expect(lists).toEqual([[B]]));
      expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });

    it('does nothing on Cancel', async () => {
      const user = userEvent.setup();
      const { calls } = renderEditor([A, B]);

      await user.click(screen.getByRole('button', { name: 'Delete image 2' }));
      await answerConfirm('Cancel');

      expect(calls).toEqual([]);
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    it('shows an alert and keeps the image when deleting fails', async () => {
      const user = userEvent.setup();
      renderEditor([A], [
        { method: 'DELETE', path: '/api/profiles/emi/banner/1', status: 404, body: problem(404, 'BANNER_IMAGE_NOT_FOUND', 'x') },
      ]);

      await user.click(screen.getByRole('button', { name: 'Delete image 1' }));
      await answerConfirm('Delete');

      expect(await screen.findByRole('alert')).toHaveTextContent('This banner image no longer exists.');
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });

    it('marks the delete button as the danger action', () => {
      renderEditor([A]);

      expect(screen.getByRole('button', { name: 'Delete image 1' })).toHaveClass('button--danger');
    });
  });

  it('shows each thumbnail whole: natural ratio, never cropped', () => {
    const shot = css.match(/\.banner-thumb__shot\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(shot).toMatch(/height:\s*auto/);
    expect(shot).not.toMatch(/object-fit:\s*cover|aspect-ratio:\s*\d/);
  });

  it('uses tokens and the 4px spacing scale only', () => {
    const own = css.slice(css.indexOf('.banner-editor {'), css.indexOf('.banner-editor {') + 3000);

    expect(own).not.toMatch(/gradient|#[0-9a-f]{3,6}\b/i);
    expect(own).not.toMatch(/(?:gap|padding|margin)[^:]*:\s*[^;]*\b\d+px/);
  });
});
