/**
 * Shared motion presets. Motion here only answers the user's actions (something added, removed or moved);
 * nothing animates on page load. <MotionConfig reducedMotion="user"> in App turns it off for reduced motion.
 */
const ease = [0.2, 0, 0, 1] as const;

/** A list row: slides in when added, collapses when removed, glides when the order changes. */
export const rowMotion = {
  layout: 'position' as const,
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, overflow: 'hidden' },
  transition: { duration: 0.22, ease },
};

/** A form that opens in place: grows from nothing and fades in. */
export const expandMotion = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.22, ease },
  style: { overflow: 'hidden' },
};

/** The sliding "you are here" pill of the nav and the profile tabs. */
export const pillTransition = { type: 'spring' as const, stiffness: 500, damping: 40 };
