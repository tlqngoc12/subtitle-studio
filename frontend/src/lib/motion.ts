/**
 * Shared motion presets. Motion here only answers the user's actions (something added, removed or moved);
 * nothing animates on page load. <MotionConfig reducedMotion="user"> in App turns it off for reduced motion.
 */
export const EASE_OUT = [0.2, 0, 0, 1] as const;
export const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const;

/** Delay of the nth item of a grid or list: 30 ms each, none beyond the 8th. */
export const staggerDelay = (index: number) => Math.min(index, 8) * 0.03;

/** A list row: slides in when added, collapses when removed, glides when the order changes. */
export const rowMotion = {
  layout: 'position' as const,
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, overflow: 'hidden' },
  transition: { duration: 0.24, ease: EASE_IN_OUT },
};

/** A form that opens in place: grows from nothing and fades in. */
export const expandMotion = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.24, ease: EASE_IN_OUT },
  style: { overflow: 'hidden' },
};

/** The sliding "you are here" pill of the nav and the profile tabs. */
/** Retimed to the base duration and the shared ease-out. */
export const pillTransition = { duration: 0.2, ease: EASE_OUT };
