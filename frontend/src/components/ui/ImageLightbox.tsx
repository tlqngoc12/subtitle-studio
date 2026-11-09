import * as Dialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { IconButton } from './IconButton';
import './ImageLightbox.css';

export interface LightboxImage {
  src: string;
  /** The image's description; an empty one is named "Ảnh k/n" instead. */
  alt: string;
}

/**
 * Shows one of `images` large in a modal dialog (Radix Dialog): left/right arrow keys and buttons browse, Esc, the
 * close button and a click outside close it. Focus returns to the element that was focused when it opened, and the
 * page behind is inert. Open while `index` is not null; the parent owns `index` and clears it in `onClose`.
 */
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: LightboxImage[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const count = images.length;
  const open = index !== null && count > 0;
  const at = open ? Math.max(0, Math.min(index, count - 1)) : 0;
  const image = images[at];
  const go = (next: number) => onIndexChange((next + count) % count);
  const content = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  function onKeyDown(e: KeyboardEvent) {
    if (count < 2) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(at - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(at + 1);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="lightbox__overlay" />
        <Dialog.Content
          ref={content}
          className="lightbox"
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          onOpenAutoFocus={(e) => {
            // Focus the dialog itself, not its first button: that would open the button's tooltip, and the first
            // Esc would then only close the tooltip.
            e.preventDefault();
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            content.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            // There is no Dialog.Trigger (the images open it), so Radix would leave focus on <body>.
            e.preventDefault();
            if (opener.current?.isConnected) opener.current.focus();
            opener.current = null;
          }}
        >
          <Dialog.Title className="visually-hidden">Xem ảnh</Dialog.Title>
          {image && (
            <img
              className="lightbox__image"
              src={image.src}
              alt={image.alt || `Ảnh ${at + 1}/${count}`}
            />
          )}
          {image?.alt && (
            // The image's alt already carries the description for screen readers; this is for everyone else (touch).
            <p className="lightbox__caption" aria-hidden="true">
              {image.alt}
            </p>
          )}
          <div className="lightbox__bar">
            {count > 1 && (
              <div className="lightbox__nav">
                <IconButton label="Ảnh trước" icon={ChevronLeft} onClick={() => go(at - 1)} />
                <span className="lightbox__counter">{`${at + 1} / ${count}`}</span>
                <IconButton label="Ảnh sau" icon={ChevronRight} onClick={() => go(at + 1)} />
              </div>
            )}
            <Dialog.Close asChild>
              <IconButton label="Đóng" icon={X} className="lightbox__close" />
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
