
/** Lowercase, Vietnamese marks removed (đ → d), so "cho dem" finds "Chợ Đêm". Thai text is left as written. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/** True when the title or the channel contains the query; an empty query matches every video. */
export function matchesSearch(video: { title: string; channel: string | null }, query: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return [video.title, video.channel ?? ''].some((text) => normalizeForSearch(text).includes(q));
}
