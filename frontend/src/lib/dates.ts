const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `2026-11-09` → `9 Nov 2026`. The string is split, never passed to `new Date()` (that parses it as UTC midnight and
 * shows the previous day west of Greenwich).
 */
export function formatDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}
