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

/** What "Fetch from X" returns: the image already stored as an uploaded media item, plus the post's day and caption. */
export interface XFetchResult {
  mediaId: number;
  mediaUrl: string;
  width: number;
  height: number;
  /** `yyyy-mm-dd` in Vietnam time, or null when X gave no date. */
  takenOn: string | null;
  /** The post text without its t.co links, or null when empty. */
  title: string | null;
}

const X_HOSTS = /^(?:www\.|mobile\.)?(?:x\.com|twitter\.com)$|^(?:www\.)?(?:fxtwitter\.com|vxtwitter\.com|fixupx\.com)$/i;

/** True for an X / Twitter post link (x.com, twitter.com, mobile., fxtwitter, vxtwitter; `/status/{id}`). */
export function isXStatusUrl(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  try {
    const url = new URL(text.includes('://') ? text : `https://${text}`);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      X_HOSTS.test(url.hostname) &&
      /\/status\/\d+/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export async function fetchFromX(url: string): Promise<XFetchResult> {
  return (await send('/api/photos/x-fetch', json('POST', { url }))).json();
}
