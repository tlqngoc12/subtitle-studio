import { LoadingText } from '../../components/ui/LoadingText';
import './ReaderSkeleton.css';

/** Placeholder shown while a chapter loads: one screen-sized sheet as wide as the reader column (the column sets the width). */
export function ReaderSkeleton() {
  return (
    <div className="reader-skeleton-wrap">
      <div className="reader-skeleton" aria-hidden="true">
        <span className="reader-skeleton__bar reader-skeleton__bar--title" />
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className="reader-skeleton__bar"
            style={{ width: i === 8 ? '60%' : i % 2 === 0 ? '100%' : '92%' }}
          />
        ))}
      </div>
      <span className="visually-hidden">
        <LoadingText>Đang tải chương…</LoadingText>
      </span>
    </div>
  );
}
