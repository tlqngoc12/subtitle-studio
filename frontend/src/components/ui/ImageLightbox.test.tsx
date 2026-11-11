import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { css } from '../../test/css';
import { ImageLightbox, type LightboxImage } from './ImageLightbox';

/** Hovers `el` and checks its tooltip, then closes just the tooltip with Esc (the dialog stays open). */
async function expectTipInDialog(user: ReturnType<typeof userEvent.setup>, el: HTMLElement, text: string) {
  await user.hover(el);
  expect(await screen.findByRole('tooltip')).toHaveTextContent(text);
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  expect(screen.getByRole('dialog')).toBeInTheDocument();
}

const IMAGES: LightboxImage[] = [
  { src: '/media/1.png', alt: 'Fan meeting' },
  { src: '/media/2.png', alt: '' },
  { src: '/media/3.png', alt: 'Backstage' },
];

/** A page with one opener button per image, like the banner. */
function Harness({ images = IMAGES, onClose }: { images?: LightboxImage[]; onClose?: () => void }) {
  const [index, setIndex] = useState<number | null>(null);
  return (
    <>
      <button type="button" onClick={() => setIndex(0)}>
        Open first
      </button>
      <button type="button" onClick={() => setIndex(2)}>
        Open third
      </button>
      <p>Page behind</p>
      <ImageLightbox
        images={images}
        index={index}
        onIndexChange={setIndex}
        onClose={() => {
          onClose?.();
          setIndex(null);
        }}
      />
    </>
  );
}

async function open(name = 'Open first') {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name }));
  return { user, dialog: screen.getByRole('dialog') };
}

describe('ImageLightbox', () => {
  it('renders nothing while closed', () => {
    render(<Harness />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a real dialog showing the image large, named by its alt text, with a counter', async () => {
    const { dialog } = await open();

    expect(dialog).toHaveAccessibleName('Xem ảnh');
    expect(within(dialog).getByRole('img', { name: 'Fan meeting' })).toHaveAttribute('src', '/media/1.png');
    expect(within(dialog).getByText('1 / 3')).toBeInTheDocument();
  });

  it('names an image without a description "Ảnh k/n"', async () => {
    const { user, dialog } = await open();

    await user.click(within(dialog).getByRole('button', { name: 'Ảnh sau' }));

    expect(within(dialog).getByRole('img', { name: 'Ảnh 2/3' })).toHaveAttribute('src', '/media/2.png');
    expect(within(dialog).getByText('2 / 3')).toBeInTheDocument();
  });

  it('browses with the buttons, wrapping around, and the buttons have tooltips', async () => {
    const { user, dialog } = await open();
    const prev = within(dialog).getByRole('button', { name: 'Ảnh trước' });
    const next = within(dialog).getByRole('button', { name: 'Ảnh sau' });
    for (const el of [prev, next]) expect(el.querySelector('svg')).not.toBeNull();
    await expectTipInDialog(user, prev, 'Ảnh trước');
    await expectTipInDialog(user, next, 'Ảnh sau');

    await user.click(prev);
    expect(within(dialog).getByRole('img', { name: 'Backstage' })).toBeInTheDocument();
    await user.click(next);
    expect(within(dialog).getByRole('img', { name: 'Fan meeting' })).toBeInTheDocument();
  });

  it('browses with the left and right arrow keys', async () => {
    const { user, dialog } = await open();

    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByText('2 / 3')).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByRole('img', { name: 'Backstage' })).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    expect(within(dialog).getByText('2 / 3')).toBeInTheDocument();
  });

  it('opens at the given index', async () => {
    const { dialog } = await open('Open third');

    expect(within(dialog).getByRole('img', { name: 'Backstage' })).toBeInTheDocument();
    expect(within(dialog).getByText('3 / 3')).toBeInTheDocument();
  });

  it('closes with Esc and returns focus to the image that opened it', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Open third' });
    await user.click(opener);

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('closes with the close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Open first' }));
    const close = screen.getByRole('button', { name: 'Đóng' });
    await expectTipInDialog(user, close, 'Đóng');

    await user.click(close);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open first' })).toHaveFocus();
  });

  it('closes with a click on the overlay but not on the image', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Open first' }));

    await user.click(screen.getByRole('img', { name: 'Fan meeting' }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(document.querySelector('.lightbox__overlay') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('makes the page behind inert to assistive technology while open', async () => {
    const { user } = await open();

    // aria-hidden on the rest of the page removes its controls from the accessibility tree.
    expect(screen.queryByRole('button', { name: 'Open first' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open first', hidden: true })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Open first' })).toBeInTheDocument();
  });

  it('keeps focus inside while open', async () => {
    const { user, dialog } = await open();

    for (let i = 0; i < 6; i++) await user.tab();

    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('has no arrows or counter for a single image', async () => {
    const user = userEvent.setup();
    render(<Harness images={[IMAGES[0]]} />);
    await user.click(screen.getByRole('button', { name: 'Open first' }));
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).queryByRole('button', { name: 'Ảnh trước' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Ảnh sau' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('1 / 1')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: 'Fan meeting' })).toBeInTheDocument();
  });

  it('is styled with tokens and sizes the image to fit 90vw x 85vh', () => {
    expect(css).toMatch(/\.lightbox__image\s*\{[^}]*max-width:\s*90vw[^}]*max-height:\s*85vh[^}]*object-fit:\s*contain/);
    const own = css.slice(css.indexOf('.lightbox__overlay'), css.indexOf('.lightbox__close'));
    expect(own).not.toMatch(/gradient|#[0-9a-f]{3,6}\b/i);
  });
});
