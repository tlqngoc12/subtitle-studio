const ZONE = 'Asia/Ho_Chi_Minh';

/*
 * The one home of date display: `dd/MM/yyyy`, instants in Vietnam time. Do not format dates with `toLocale*` elsewhere.
 */

/**
 * `2026-11-09` → `09/11/2026`. The string is split, never passed to `new Date()` (that parses it as UTC midnight and
 * shows the previous day west of Greenwich).
 */
export function formatDay(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
}

const DATE = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** An instant (ISO timestamp) → `dd/MM/yyyy` in Vietnam time. */
export function formatInstant(iso: string): string {
  return DATE.format(new Date(iso));
}

/** An instant (ISO timestamp) → `dd/MM/yyyy HH:mm` (24 hour) in Vietnam time. */
export function formatInstantWithTime(iso: string): string {
  return DATE_TIME.format(new Date(iso)).replace(', ', ' ');
}
