import { useT } from '../lib/i18n';
import './RouteFallback.css';

/**
 * Shown by `<Suspense>` while a lazy route page downloads. The nav bar and footer stay rendered outside it, so the
 * shell never flashes empty; the block only keeps the page area tall enough that the footer does not jump.
 */
export function RouteFallback() {
  const t = useT();
  return (
    <div className="route-fallback" role="status">
      <span className="visually-hidden">{t('Loading…', 'Đang tải…')}</span>
    </div>
  );
}
