const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Same shape as the .srt file (HH:MM:SS,mmm) so the preview matches what gets downloaded. */
export function formatTimecode(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1_000) % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(ms % 1_000, 3)}`;
}

/** YouTube-style duration: 12:34 or 1:12:01. Null when unknown (e.g. livestreams). */
export function formatDuration(sec: number | null): string | null {
  if (sec === null) return null;
  const hours = Math.floor(sec / 3_600);
  const minutes = Math.floor(sec / 60) % 60;
  const seconds = sec % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
