import { useMemo, useState } from 'react';
import type { BannerImage } from '../../api/profiles';
import { FanCarousel, type FanItem } from '../ui/FanCarousel';
import { ImageLightbox } from '../ui/ImageLightbox';
import './ProfileBanner.css';

/**
 * The fanned banner under a profile's title (admin and public). Renders nothing without images. An image's `alt` is
 * its description, or "" when it has none; the clickable item is then named "Ảnh k/n" (never the profile's name).
 * A click opens the lightbox on that image.
 */
export function ProfileBanner({ images }: { images: BannerImage[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const count = images.length;

  const items: FanItem[] = useMemo(
    () =>
      images.map((image, i) => {
        const alt = image.altText?.trim() ?? '';
        return {
          key: String(image.id),
          src: image.mediaUrl,
          alt,
          name: alt || `Ảnh ${i + 1}/${count}`,
          onOpen: () => setOpen(i),
        };
      }),
    [images, count],
  );

  if (count === 0) return null;
  return (
    <>
      <div className="pbanner">
        <FanCarousel items={items} label="Ảnh banner" hold={open !== null} />
      </div>
      <ImageLightbox
        images={images.map((image) => ({ src: image.mediaUrl ?? '', alt: image.altText?.trim() ?? '' }))}
        index={open}
        onIndexChange={setOpen}
        onClose={() => setOpen(null)}
      />
    </>
  );
}
