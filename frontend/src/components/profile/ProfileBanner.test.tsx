import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { BannerImage } from '../../api/profiles';
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

/** The image button inside the strip's row (the dots share the "Ảnh k/n" names). */
const slide = (name: string) => within(document.querySelector('.filmstrip__row') as HTMLElement).getByRole('button', { name });

describe('ProfileBanner', () => {
  it('renders nothing without images', () => {
    const { container } = renderBanner([]);

    expect(container).toBeEmptyDOMElement();
  });

  it('is a region holding one button per image', () => {
    renderBanner();

    const region = screen.getByRole('region', { name: 'Ảnh banner' });
    const row = region.querySelector('.filmstrip__row') as HTMLElement;
    expect(
      within(row).getAllByRole('button', {
        name: /^(Fan meeting|Ảnh 2\/3|Backstage)$/,
      }),
    ).toHaveLength(3);
    // Plus one dot per image below the row.
    expect(region.querySelectorAll('.filmstrip__dot')).toHaveLength(3);
  });

  it('uses the alt text as the image alt and the item name', () => {
    renderBanner();

    const first = screen.getByRole('button', { name: 'Fan meeting' });
    expect(first.querySelector('img')).toHaveAttribute('alt', 'Fan meeting');
    expect(first.querySelector('img')).toHaveAttribute('src', '/media/a.png');
  });

  it('gives an image without a description alt="" and the neutral name "Ảnh k/n"', () => {
    renderBanner();

    const second = slide('Ảnh 2/3');
    expect(second.querySelector('img')).toHaveAttribute('alt', '');
    // The name never includes the profile.
    expect(second).toHaveAccessibleName('Ảnh 2/3');
  });

  it('treats a blank description like none', () => {
    renderBanner([{ id: 1, mediaUrl: '/media/a.png', altText: '   ' }]);

    expect(slide('Ảnh 1/1').querySelector('img')).toHaveAttribute('alt', '');
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

  it('opens the lightbox at the right index and shows the description under the image', async () => {
    const user = userEvent.setup();
    renderBanner();

    await user.click(screen.getByRole('button', { name: 'Backstage' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('3 / 3')).toBeInTheDocument();
    expect(within(dialog).getByText('Backstage', { selector: '.lightbox__caption' })).toBeInTheDocument();
  });

  it('shows no caption in the lightbox for an undescribed image', async () => {
    const user = userEvent.setup();
    renderBanner();

    await user.click(slide('Ảnh 2/3'));

    expect(screen.getByRole('dialog').querySelector('.lightbox__caption')).toBeNull();
  });

  it('does not touch the Novels banner (FanCarousel in cover mode)', () => {
    renderBanner();

    expect(document.querySelector('.fan')).toBeNull();
  });

  it('names an undescribed image in the lightbox "Ảnh k/n"', async () => {
    const user = userEvent.setup();
    renderBanner();

    await user.click(slide('Ảnh 2/3'));

    expect(within(screen.getByRole('dialog')).getByRole('img', { name: 'Ảnh 2/3' })).toBeInTheDocument();
  });

  it('closes the lightbox with Esc and returns focus to the image that was opened', async () => {
    const user = userEvent.setup();
    renderBanner();
    const opened = slide('Ảnh 2/3');
    await user.click(opened);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opened).toHaveFocus();
  });

  it('shows a single image and still opens it', async () => {
    const user = userEvent.setup();
    renderBanner([IMAGES[0]]);

    await user.click(screen.getByRole('button', { name: 'Fan meeting' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps the carousel working when an image has no URL (placeholder)', () => {
    const { container } = renderBanner([{ id: 1, mediaUrl: null, altText: 'Lost' }, IMAGES[1]]);

    expect(container.querySelectorAll('.novel-card__cover--empty')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Lost' })).toBeInTheDocument();
  });
});
