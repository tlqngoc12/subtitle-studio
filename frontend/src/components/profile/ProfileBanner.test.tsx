import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { BannerImage } from '../../api/profiles';
import { css } from '../../test/css';
import { ProfileBanner } from './ProfileBanner';

const IMAGES: BannerImage[] = [
  { id: 1, mediaUrl: '/media/a.png', altText: 'Fan meeting' },
  { id: 2, mediaUrl: '/media/b.png', altText: null },
  { id: 3, mediaUrl: '/media/c.png', altText: 'Backstage' },
];

function renderBanner(images: BannerImage[] = IMAGES) {
  return render(
    <MemoryRouter>
      <ProfileBanner images={images} />
    </MemoryRouter>,
  );
}

describe('ProfileBanner', () => {
  it('renders nothing without images', () => {
    const { container } = renderBanner([]);

    expect(container).toBeEmptyDOMElement();
  });

  it('is a region of fanned images, centred, with the carousel controls', () => {
    renderBanner();

    const region = screen.getByRole('region', { name: 'Ảnh banner' });
    expect(within(region).getAllByRole('button', { name: /^(Fan meeting|Ảnh 2\/3|Backstage)$/ })).toHaveLength(3);
    expect(within(region).getByText('01 / 03')).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Ảnh sau' })).toBeInTheDocument();
  });

  it('uses the alt text as the image alt and the item name', () => {
    renderBanner();

    const first = screen.getByRole('button', { name: 'Fan meeting' });
    expect(first.querySelector('img')).toHaveAttribute('alt', 'Fan meeting');
    expect(first.querySelector('img')).toHaveAttribute('src', '/media/a.png');
  });

  it('gives an image without a description alt="" and the neutral name "Ảnh k/n"', () => {
    renderBanner();

    const second = screen.getByRole('button', { name: 'Ảnh 2/3' });
    expect(second.querySelector('img')).toHaveAttribute('alt', '');
    // The name never includes the profile.
    expect(second).toHaveAccessibleName('Ảnh 2/3');
  });

  it('treats a blank description like none', () => {
    renderBanner([{ id: 1, mediaUrl: '/media/a.png', altText: '   ' }]);

    expect(screen.getByRole('button', { name: 'Ảnh 1/1' }).querySelector('img')).toHaveAttribute('alt', '');
  });

  it('opens the lightbox on the clicked image and browses it', async () => {
    const user = userEvent.setup();
    renderBanner();

    await user.click(screen.getByRole('button', { name: 'Backstage' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('img', { name: 'Backstage' })).toHaveAttribute('src', '/media/c.png');
    expect(within(dialog).getByText('3 / 3')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Ảnh sau' }));
    expect(within(dialog).getByRole('img', { name: 'Fan meeting' })).toBeInTheDocument();
  });

  it('names an undescribed image in the lightbox "Ảnh k/n"', async () => {
    const user = userEvent.setup();
    renderBanner();

    await user.click(screen.getByRole('button', { name: 'Ảnh 2/3' }));

    expect(within(screen.getByRole('dialog')).getByRole('img', { name: 'Ảnh 2/3' })).toBeInTheDocument();
  });

  it('closes the lightbox with Esc and returns focus to the image that was opened', async () => {
    const user = userEvent.setup();
    renderBanner();
    const opened = screen.getByRole('button', { name: 'Ảnh 2/3' });
    await user.click(opened);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opened).toHaveFocus();
  });

  it('shows a single image without controls, and still opens it', async () => {
    const user = userEvent.setup();
    renderBanner([IMAGES[0]]);

    expect(screen.queryByRole('button', { name: 'Ảnh sau' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fan meeting' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps the carousel working when an image has no URL (placeholder)', () => {
    const { container } = renderBanner([{ id: 1, mediaUrl: null, altText: 'Lost' }, IMAGES[1]]);

    expect(container.querySelectorAll('.novel-card__cover--empty')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Lost' })).toBeInTheDocument();
  });

  describe('style', () => {
    it('is a flat surface with a 1px rule border and the frame radius, using theme tokens only', () => {
      const block = css.match(/\.pbanner\s*\{[^}]*\}/)?.[0] ?? '';

      expect(block).toMatch(/background:\s*var\(--surface\)/);
      expect(block).toMatch(/border:\s*1px solid var\(--rule\)/);
      expect(block).toMatch(/border-radius:\s*var\(--radius-frame\)/);
      expect(block).not.toMatch(/gradient|box-shadow|#[0-9a-f]{3,6}\b|rgb\(/i);
    });

    it('puts no shadow on the images', () => {
      const own = css.slice(css.indexOf('.pbanner {'), css.indexOf('.pbanner {') + 600);

      expect(own).not.toMatch(/shadow/);
    });
  });
});
