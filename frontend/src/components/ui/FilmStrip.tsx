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
 * A full-bleed one-image-at-a-time slider: each slide is the strip's full width and its image shows whole, at its
 * natural ratio. It scrolls natively (swipe, wheel, snap one slide); on hover devices `‹ ›` buttons scroll one slide
 * and hide at the ends, and dots below show and jump to the current slide. Hovering or focusing an image shows its
 * description in a bar. Each image is a button calling `onOpen(index)`.
 */
export function FilmStrip({
  images,
  label,
  onOpen,
  autoplayMs,
  paused = false,
}: {
  images: FilmImage[];
  /** Gives the strip a region landmark with this name. */
  label: string;
  onOpen: (index: number) => void;
  /** Advances to the next slide (and loops to the first) after this many ms; off when omitted. */
  autoplayMs?: number;
  /** Holds autoplay while true (e.g. a lightbox is open). */
  paused?: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const [current, setCurrent] = useState(0);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [tick, setTick] = useState(0);
  const reduced = usePrefersReducedMotion();
  const count = images.length;
  const running = autoplayMs !== undefined && autoplayMs > 0 && count > 1 && !reduced && !paused && !hovered && !focused && !hidden;

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const start = el.scrollLeft <= 1;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    if (el.clientWidth > 0) setCurrent(Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
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

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // One timeout per slide: any change of slide (swipe, arrows, dots) re-arms it, so manual navigation resets the timer.
  useEffect(() => {
    if (!running || autoplayMs === undefined) return;
    const timer = setTimeout(() => {
      const el = row.current;
      if (!el) return;
      el.scrollTo({ left: ((current + 1) % count) * el.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
      setTick((t) => t + 1);
    }, autoplayMs);
    return () => clearTimeout(timer);
  }, [running, autoplayMs, current, count, reduced, tick]);

  if (count === 0) return null;

  function scroll(direction: 1 | -1) {
    const el = row.current;
    if (!el) return;
    el.scrollBy({
      left: direction * el.clientWidth,
      behavior: reduced ? 'auto' : 'smooth',
    });
  }

  function goTo(index: number) {
    const el = row.current;
    if (!el) return;
    el.scrollTo({
      left: index * el.clientWidth,
      behavior: reduced ? 'auto' : 'smooth',
    });
  }

  const many = count > 1;

  return (
    <section
      className="filmstrip"
      aria-label={label}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="filmstrip__stage">
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
        {many && !edges.start && (
          <IconButton label="Ảnh trước" icon={ChevronLeft} className="filmstrip__arrow filmstrip__arrow--prev" onClick={() => scroll(-1)} />
        )}
        {many && !edges.end && <IconButton label="Ảnh sau" icon={ChevronRight} className="filmstrip__arrow filmstrip__arrow--next" onClick={() => scroll(1)} />}
      </div>
      {many && (
        <div className="filmstrip__dots">
          {images.map((image, i) => (
            <button
              key={image.key}
              type="button"
              className="filmstrip__dot"
              aria-label={`Ảnh ${i + 1}/${count}`}
              aria-current={i === current ? 'true' : undefined}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
