import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { EASE_OUT, staggerDelay } from '../../lib/motion';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

type Tag = 'div' | 'section' | 'li' | 'article' | 'ul' | 'header';

interface Props {
  as?: Tag;
  /** Position in a grid or list: delays the reveal by 30 ms per item, up to the 8th. */
  delayIndex?: number;
  className?: string;
  /** Glides to its new place when the list around it changes (a filter, a save). */
  layout?: boolean;
  children: ReactNode;
}

/** Fades and lifts its children in the first time they scroll into view. Plain element under reduced motion. */
export function Reveal({ as = 'div', delayIndex, className, layout, children }: Props) {
  const reduced = usePrefersReducedMotion();
  if (reduced || typeof IntersectionObserver === 'undefined') {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }
  const Animated = motion[as];
  const staggered = delayIndex !== undefined;
  return (
    <Animated
      className={className}
      layout={layout ? 'position' : undefined}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: staggered ? 0.24 : 0.32, delay: staggered ? staggerDelay(delayIndex) : 0, ease: EASE_OUT }}
    >
      {children}
    </Animated>
  );
}
