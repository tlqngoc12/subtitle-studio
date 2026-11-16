import getCaretCoordinates from 'textarea-caret';

/**
 * Scrolls the page so the text at `index` in the auto-growing textarea is visible and not under sticky UI.
 * `coveredTop` is the viewport y below which the page is not covered (the bottom of the sticky bar). A match that is
 * already on screen does not move the page; otherwise it lands two line heights below `coveredTop`.
 */
export function scrollMatchIntoView(el: HTMLTextAreaElement, index: number, coveredTop: number): void {
  const { top, height } = getCaretCoordinates(el, index);
  const y = el.getBoundingClientRect().top + top - el.scrollTop; // viewport y of the match's line
  if (y >= coveredTop && y + height <= window.innerHeight) return;
  window.scrollTo({ top: window.scrollY + y - coveredTop - 2 * height });
}
