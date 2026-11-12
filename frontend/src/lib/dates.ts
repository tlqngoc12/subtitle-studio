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

/**
 * Typed `d/M/yyyy` (also `dd/MM/yyyy`, with `/`, `-` or `.` as separators) → `yyyy-mm-dd`, or null when the text is not
 * a real calendar day (31/02 is rejected). No `Date` parsing of strings is involved.
 */
export function parseDay(text: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(year, month - 1, day);
  if (year < 1 || check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
