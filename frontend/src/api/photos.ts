/** Typed client for the Photos API (photos spec). `postUrl` is an Instagram or X post link. */
import { send } from './client';

export type PhotoSource = 'OFFICIAL' | 'MEDIA' | 'FAN';

export interface PhotoPost {
  id: number;
  postUrl: string;
  imageUrl: string;
  width: number;
  height: number;
  title: string;
  /** `yyyy-mm-dd`; format with `formatDay`, never `new Date()`. */
  takenOn: string;
  source: PhotoSource;
  photoCount: number | null;
  /** Profile slugs. */
  profiles: string[];
}

export type PhotoPostInput = Omit<PhotoPost, 'id' | 'imageUrl' | 'width' | 'height'> & { mediaId: number };

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function listPhotos(): Promise<PhotoPost[]> {
  return (await send('/api/photos')).json();
}

export async function createPhoto(input: PhotoPostInput): Promise<PhotoPost> {
  return (await send('/api/photos', json('POST', input))).json();
}

export async function updatePhoto(id: number, input: PhotoPostInput): Promise<PhotoPost> {
  return (await send(`/api/photos/${id}`, json('PUT', input))).json();
}

export async function deletePhoto(id: number): Promise<void> {
  await send(`/api/photos/${id}`, { method: 'DELETE' });
}
