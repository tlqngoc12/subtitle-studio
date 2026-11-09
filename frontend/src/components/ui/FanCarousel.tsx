import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type FocusEvent } from 'react';
import { Link } from 'react-router';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import { Cover } from './Cover';
import { IconButton } from './IconButton';
import './FanCarousel.css';

const ADVANCE_MS = 6000;
const pad = (n: number) => String(n).padStart(2, '0');

export interface FanItem {
  key: string;
  /** Image URL; the empty-cover placeholder shows when it is missing or fails to load. */
  src: string | null;
  /** The image's `alt`; use "" when the image has no description (the item then needs a `name`). */
  alt: string;
  /** Accessible name of the clickable item. Without it the item is named by the image's `alt`. */
  name?: string;
  /** The item is a router link. */
  href?: string;
  /** The item is a button that calls this. */
  onOpen?: () => void;
}

export interface FanLabels {
  previous: string;
  next: string;
}

const DEFAULT_LABELS: FanLabels = { previous: 'Ảnh trước', next: 'Ảnh sau' };

/**
 * Images fanned around the middle of the container: the current one in front and larger, its neighbours rotated
 * behind. It moves on every 6 seconds unless paused, hovered, focused (or `hold`), and never moves by itself with
 * prefers-reduced-motion. Controls sit centred below. On narrow screens only the current image shows. Uncontrolled
 * unless `index` is given. With one item there is no timer, arrows, counter or pause button.
 */
export function FanCarousel({
  items,
  label,
  index: controlledIndex,
  onIndexChange,
  hold = false,
  labels = DEFAULT_LABELS,
  fit = 'cover',
}: {
  items: FanItem[];
  /** Gives the carousel a region landmark with this name. */
  label?: string;
  /** Controlled current index. */
  index?: number;
  onIndexChange?: (index: number) => void;
  /** The parent asks for the timer to wait (for example while its own area is hovered). */
  hold?: boolean;
  labels?: FanLabels;
  /** `cover` (default): fixed-ratio cards that crop. `natural`: each card keeps its image's own ratio and shows it whole. */
  fit?: 'cover' | 'natural';
}) {
  const count = items.length;
  const [inner, setInner] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const reduced = usePrefersReducedMotion();

  const at = Math.max(0, Math.min(controlledIndex ?? inner, count - 1));
  const go = (next: number) => {
    setInner(next);
    onIndexChange?.(next);
  };

  const running = count > 1 && !paused && !hovered && !focused && !hold && !reduced;
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => go((at + 1) % count), ADVANCE_MS);
    return () => clearTimeout(timer);
    // `go` only forwards to setState and the parent's callback; the timer restarts on a real change.
  }, [running, at, count]);

  if (count === 0) return null;
  const half = Math.floor(count / 2);

  function onBlur(e: FocusEvent<HTMLElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
  }

  return (
    <section
      className={fit === 'natural' ? 'fan fan--natural' : 'fan'}
      aria-label={label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
    >
      <div className="fan__stage">
        {items.map((it, i) => {
          // Signed distance to the current item around the circle: -2..2 for five items.
          const o = ((((i - at + half) % count) + count) % count) - half;
          const style = { '--o': String(o), '--d': String(Math.abs(o)) } as CSSProperties;
          const common = {
            className: 'fan__item',
            'aria-current': i === at ? ('true' as const) : undefined,
            'aria-label': it.name,
            style,
          };
          const art = (
            <Cover
              src={failed.has(it.key) ? null : it.src}
              alt={it.alt}
              className="fan__art"
              draggable={false}
              onError={() => setFailed((all) => new Set(all).add(it.key))}
            />
          );
          if (it.href !== undefined) {
            return (
              <Link key={it.key} to={it.href} {...common}>
                {art}
              </Link>
            );
          }
          if (it.onOpen) {
            return (
              <button key={it.key} type="button" onClick={it.onOpen} {...common}>
                {art}
              </button>
            );
          }
          return (
            <div key={it.key} {...common}>
              {art}
            </div>
          );
        })}
      </div>
      {count > 1 && (
        <div className="fan__controls">
          <IconButton label={labels.previous} icon={ChevronLeft} onClick={() => go((at - 1 + count) % count)} />
          <span className="fan__counter">{`${pad(at + 1)} / ${pad(count)}`}</span>
          <IconButton label={labels.next} icon={ChevronRight} onClick={() => go((at + 1) % count)} />
          <button
            className="button button--icon"
            type="button"
            aria-label={paused ? 'Tiếp tục' : 'Tạm dừng'}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? <Play className="icon" aria-hidden="true" /> : <Pause className="icon" aria-hidden="true" />}
          </button>
        </div>
      )}
    </section>
  );
}
