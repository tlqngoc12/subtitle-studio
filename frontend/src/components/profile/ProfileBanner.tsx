import { useMemo, useState } from 'react';
import type { BannerImage } from '../../api/profiles';
import { FilmStrip, type FilmImage } from '../ui/FilmStrip';
import { ImageLightbox } from '../ui/ImageLightbox';

/**
 * The full-width film strip under a profile's title (admin and public). Renders nothing without images. An image's
 * description is its alt text; the clickable item is named "Ảnh k/n" when it has none (never the profile's name).
 * A click opens the lightbox on that image.
 */
export function ProfileBanner({ images }: { images: BannerImage[] }) {
  const [open, setOpen] = useState<number | null>(null);

  const strip: FilmImage[] = useMemo(
    () => images.map((image) => ({ key: String(image.id), src: image.mediaUrl, description: image.altText?.trim() ?? '' })),
    [images],
  );

  if (images.length === 0) return null;
  return (
    <>
      <FilmStrip images={strip} label="Ảnh banner" onOpen={setOpen} autoplayMs={5000} paused={open !== null} />
      <ImageLightbox
        images={strip.map((image) => ({ src: image.src ?? '', alt: image.description }))}
        index={open}
        onIndexChange={setOpen}
        onClose={() => setOpen(null)}
      />
    </>
  );
}
