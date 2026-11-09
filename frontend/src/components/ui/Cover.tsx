import { BookOpen } from 'lucide-react';
import './Cover.css';

/** A novel cover image, or the empty placeholder with a book icon when there is none. */
export function Cover({
  src,
  className = 'novel-card__cover',
  lazy = false,
  draggable,
  alt = '',
  onError,
}: {
  src?: string | null;
  /** The cover's own class (it also gets `novel-card__cover--empty` when empty). */
  className?: string;
  lazy?: boolean;
  draggable?: boolean;
  /** Alt text of the image; decorative ("") by default, because the cover's link or button names it. */
  alt?: string;
  /** Called when the image fails to load. */
  onError?: () => void;
}) {
  if (src) {
    return (
      <img
        className={className}
        src={src}
        alt={alt}
        loading={lazy ? 'lazy' : undefined}
        draggable={draggable}
        onError={onError}
      />
    );
  }
  return (
    <span className={`${className} novel-card__cover--empty`} aria-hidden="true">
      <BookOpen className="icon" />
    </span>
  );
}
