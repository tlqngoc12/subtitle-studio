import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { Cover } from './Cover';
import { IconButton } from './IconButton';
import './FilmStrip.css';

export interface FilmImage {
  key: string;
  /** Image URL; the empty placeholder shows when it is missing or fails to load. */
  src: string | null;
  /** The image's description (its alt text); "" when it has none. */
  description: string;
}

/**
 * A full-bleed horizontal row of images, all the same height and each at its natural width (never cropped). It
 * scrolls natively (swipe, wheel, snap); on hover devices `‹ ›` buttons scroll it by about one viewport and hide at the
 * ends. Hovering or focusing an image shows its description in a bar. Each image is a button calling `onOpen(index)`.
 */
export function FilmStrip({
  images,
  label,
  onOpen,
}: {
  images: FilmImage[];
  /** Gives the strip a region landmark with this name. */
  label: string;
  onOpen: (index: number) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const reduced = usePrefersReducedMotion();
  const count = images.length;

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const start = el.scrollLeft <= 1;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useLayoutEffect(measure, [measure, count]);
  useEffect(() => {
    const el = row.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Images load after the first render and change the row's width; the viewport resizing changes its view.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [measure, count]);

  if (count === 0) return null;

  function scroll(direction: 1 | -1) {
    const el = row.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
  }

  return (
    <section className="filmstrip" aria-label={label}>
      <div className="filmstrip__row" ref={row} onScroll={measure}>
        {images.map((image, i) => {
          const name = image.description || `Ảnh ${i + 1}/${count}`;
          return (
            <button key={image.key} type="button" className="filmstrip__item" aria-label={name} onClick={() => onOpen(i)}>
              <Cover
                src={failed.has(image.key) ? null : image.src}
                alt={image.description}
                className="filmstrip__art"
                draggable={false}
                lazy
                onError={() => setFailed((all) => new Set(all).add(image.key))}
              />
              {image.description && (
                <span className="filmstrip__bar" aria-hidden="true">
                  {image.description}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!edges.start && (
        <IconButton label="Ảnh trước" icon={ChevronLeft} className="filmstrip__arrow filmstrip__arrow--prev" onClick={() => scroll(-1)} />
      )}
      {!edges.end && (
        <IconButton label="Ảnh sau" icon={ChevronRight} className="filmstrip__arrow filmstrip__arrow--next" onClick={() => scroll(1)} />
      )}
    </section>
  );
}
