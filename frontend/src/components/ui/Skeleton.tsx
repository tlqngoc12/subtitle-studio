import type { CSSProperties } from 'react';
import { useDelayedFlag } from '../../lib/useDelayedFlag';
import './Skeleton.css';

/** A grey block that pulses; sized by the caller to match the final layout. */
export function Skeleton({ width, height, radius, style }: { width?: string; height?: string; radius?: string; style?: CSSProperties }) {
  return <span className="skeleton" aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />;
}

/** Placeholder cards for a grid; mount it only while loading, it appears after 150 ms. */
export function SkeletonGrid({ count, aspect }: { count: number; aspect: string }) {
  const show = useDelayedFlag(true);
  if (!show) return null;
  return (
    <div className="skeleton-grid" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} style={{ aspectRatio: aspect, width: '100%', height: 'auto' }} />
      ))}
    </div>
  );
}

/** Placeholder rows for a list; mount it only while loading, it appears after 150 ms. */
export function SkeletonList({ rows }: { rows: number }) {
  const show = useDelayedFlag(true);
  if (!show) return null;
  return (
    <div className="skeleton-list" role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <Skeleton width="72px" height="48px" />
          <div className="skeleton-row__text">
            <Skeleton width="60%" height="16px" />
            <Skeleton width="35%" height="12px" />
          </div>
        </div>
      ))}
    </div>
  );
}
