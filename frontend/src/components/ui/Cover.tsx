import { BookOpen } from 'lucide-react';

/** A novel cover image, or the empty placeholder with a book icon when there is none. */
export function Cover({
  src,
  className = 'novel-card__cover',
  lazy = false,
  draggable,
}: {
  src?: string | null;
  /** The cover's own class (it also gets `novel-card__cover--empty` when empty). */
  className?: string;
  lazy?: boolean;
  draggable?: boolean;
}) {
  if (src) {
    return <img className={className} src={src} alt="" loading={lazy ? 'lazy' : undefined} draggable={draggable} />;
  }
  return (
    <span className={`${className} novel-card__cover--empty`} aria-hidden="true">
      <BookOpen className="icon" />
    </span>
  );
}
