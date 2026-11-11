export type TileShape = 'tall' | 'wide' | 'square';

/** Bento tile from the image ratio r = height / width: r >= 1.2 is 1x2, r <= 0.8 is 2x1, anything else 1x1. */
export function tileShape(width: number, height: number): TileShape {
  const r = height / width;
  if (r >= 1.2) return 'tall';
  if (r <= 0.8) return 'wide';
  return 'square';
}
