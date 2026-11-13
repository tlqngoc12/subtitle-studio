import { ArrowUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useT } from '../lib/i18n';
import { EASE_OUT } from '../lib/motion';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import './BackToTop.css';

/** The button shows after one screen of scrolling and hides again once back within half a screen of the top. */
const SHOW_AFTER = 1;
const HIDE_BELOW = 0.5;

interface Props {
  /** Routes with a bar of their own at the bottom (reader, chapter editor): no button there. */
  hideOn?: RegExp[];
  /** Routes with a fixed bar on phones (the novel's Read button): the button sits above it. */
  liftOn?: RegExp[];
  /** Routes with a sticky form bar (FormActions): the button sits above it at every width. */
  barOn?: RegExp[];
}

/** True while something covers the page: the filled video player, or a modal (Radix locks the body scroll). */
function pageCovered(): boolean {
  return document.documentElement.classList.contains('player-filled-open') || document.body.hasAttribute('data-scroll-locked');
}

/**
 * A floating "back to top" button, mounted once in each app shell. It fades in after about a screen of scrolling,
 * scrolls smoothly up (at once with reduced motion) and then moves focus to the page's `<main>`, so keyboard users
 * continue from the top rather than from a button that has just disappeared.
 */
export function BackToTop({ hideOn = [], liftOn = [], barOn = [] }: Props) {
  const t = useT();
  const { pathname } = useLocation();
  const reduced = usePrefersReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [covered, setCovered] = useState(pageCovered);

  useEffect(() => {
    const onScroll = () =>
      setScrolled((was) => window.scrollY > window.innerHeight * (was ? HIDE_BELOW : SHOW_AFTER));
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const update = () => setCovered(pageCovered());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-scroll-locked'] });
    update();
    return () => observer.disconnect();
  }, []);

  const hidden = covered || hideOn.some((r) => r.test(pathname));
  const lifted = liftOn.some((r) => r.test(pathname));
  const aboveBar = barOn.some((r) => r.test(pathname));

  function goTop() {
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    const main = document.querySelector<HTMLElement>('main');
    if (main) {
      main.id = 'main';
      main.tabIndex = -1;
      main.focus({ preventScroll: true });
    }
  }

  return (
    <AnimatePresence>
      {scrolled && !hidden && (
        <motion.button
          key="back-to-top"
          type="button"
          className={['back-to-top', lifted && 'back-to-top--lifted', aboveBar && 'back-to-top--above-bar'].filter(Boolean).join(' ')}
          aria-label={t('Back to top', 'Lên đầu trang')}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          onClick={goTop}
        >
          <ArrowUp className="icon" aria-hidden="true" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
