import type { PhotoPost } from '../api/photos';

export function photo(id: number, overrides: Partial<PhotoPost> = {}): PhotoPost {
  return {
    id,
    postUrl: `https://www.instagram.com/p/POST${id}/`,
    imageUrl: `/media/${id}.webp`,
    width: 1080,
    height: 1080,
    title: `Post ${id}`,
    takenOn: '2026-11-09',
    source: 'OFFICIAL',
    photoCount: null,
    profiles: [],
    ...overrides,
  };
}
