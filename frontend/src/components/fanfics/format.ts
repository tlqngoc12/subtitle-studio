const UNITS: { from: number; suffix: string }[] = [
  { from: 1_000_000_000, suffix: 'B' },
  { from: 1_000_000, suffix: 'M' },
  { from: 1_000, suffix: 'K' },
];

/**
 * Wattpad-style short number: 51029 → "51K", 2167 → "2.1K", 12345678 → "12.3M". It truncates to one decimal and
 * never rounds up (1999 is "1.9K"), as Wattpad does; anything that is not a positive finite number reads "0".
 */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  const value = Math.floor(n);
  const unit = UNITS.find((u) => value >= u.from);
  if (!unit) return String(value);
  const tenths = Math.floor(value / (unit.from / 10));
  const whole = Math.floor(tenths / 10);
  const decimal = tenths % 10;
  return `${whole}${decimal === 0 ? '' : `.${decimal}`}${unit.suffix}`;
}

/** Minutes as "1h 8m" or "45m"; "—" when there are none (a story without word counts). */
export function formatReadingTime(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 1) return '—';
  const total = Math.round(minutes);
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
