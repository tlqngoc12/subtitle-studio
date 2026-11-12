import { useT } from '../lib/i18n';
import './SkipLink.css';

/**
 * The first focusable element of the app shell: hidden until it has keyboard focus, then jumps to the page's
 * `<main>` (given `id="main"` and `tabIndex={-1}` here, so every page gets it without repeating it).
 */
export function SkipLink() {
  const t = useT();
  return (
    <a
      className="skip-link"
      href="#main"
      onClick={(e) => {
        const main = document.querySelector('main');
        if (!main) return;
        e.preventDefault();
        main.id = 'main';
        main.tabIndex = -1;
        main.focus({ preventScroll: true });
        main.scrollIntoView();
      }}
    >
      {t('Skip to main content', 'Bỏ qua tới nội dung chính')}
    </a>
  );
}
