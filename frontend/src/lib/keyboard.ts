/** True while the user types in a field, so page shortcuts (F, Shift+N, Shift+P) leave the keys alone. */
export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}
