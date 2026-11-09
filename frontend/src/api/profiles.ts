/** Typed client for the profile pages API (profiles spec section 5). */
import { send } from './client';

export type BlockType = 'TEXT' | 'IMAGE' | 'GALLERY' | 'EMBED' | 'LINKS' | 'FACTS';

export interface ProfileItem {
  label: string | null;
  value: string | null;
  mediaId: number | null;
  mediaUrl: string | null;
}

export interface ProfileBlock {
  id: number;
  type: BlockType;
  title: string | null;
  body: string | null;
  mediaId: number | null;
  mediaUrl: string | null;
  caption: string | null;
  embedUrl: string | null;
  items: ProfileItem[];
}

/** One image of a profile's banner; `altText` is optional and only read by screen readers. */
export interface BannerImage {
  id: number;
  /** Null when the file is missing from the public site. */
  mediaUrl: string | null;
  altText: string | null;
}

export interface Profile {
  slug: string;
  displayName: string;
  updatedAt: string;
  blocks: ProfileBlock[];
  /** In display order. Profile data published before the banner existed has none. */
  banner: BannerImage[];
}

export interface ProfileSummary {
  slug: string;
  displayName: string;
}

/** What the editor sends; the server ignores fields that do not belong to `type`. */
export type BlockInput = Omit<ProfileBlock, 'id' | 'mediaUrl' | 'items'> & {
  items: Omit<ProfileItem, 'mediaUrl'>[];
};

export type Direction = 'UP' | 'DOWN';

const base = (slug: string) => `/api/profiles/${encodeURIComponent(slug)}`;

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function listProfiles(): Promise<ProfileSummary[]> {
  return (await send('/api/profiles')).json();
}

export async function getProfile(slug: string): Promise<Profile> {
  return (await send(base(slug))).json();
}

export async function addBlock(slug: string, input: BlockInput): Promise<ProfileBlock> {
  return (await send(`${base(slug)}/blocks`, json('POST', input))).json();
}

export async function updateBlock(slug: string, id: number, input: BlockInput): Promise<ProfileBlock> {
  return (await send(`${base(slug)}/blocks/${id}`, json('PUT', input))).json();
}

export async function deleteBlock(slug: string, id: number): Promise<void> {
  await send(`${base(slug)}/blocks/${id}`, { method: 'DELETE' });
}

/** Returns the profile's blocks in their new order. */
export async function moveBlock(slug: string, id: number, direction: Direction): Promise<ProfileBlock[]> {
  return (await send(`${base(slug)}/blocks/${id}/move`, json('POST', { direction }))).json();
}

/** Adds an uploaded image to the banner (max 8); returns the whole banner. */
export async function addBannerImage(slug: string, mediaId: number, altText: string | null): Promise<BannerImage[]> {
  return (await send(`${base(slug)}/banner`, json('POST', { mediaId, altText }))).json();
}

/** Changes (or, with null, clears) an image's description; returns the whole banner. */
export async function updateBannerAltText(slug: string, id: number, altText: string | null): Promise<BannerImage[]> {
  return (await send(`${base(slug)}/banner/${id}`, json('PUT', { altText }))).json();
}

export async function deleteBannerImage(slug: string, id: number): Promise<BannerImage[]> {
  return (await send(`${base(slug)}/banner/${id}`, { method: 'DELETE' })).json();
}

/** `imageIds` lists every banner image once, in the new order. */
export async function reorderBanner(slug: string, imageIds: number[]): Promise<BannerImage[]> {
  return (await send(`${base(slug)}/banner/order`, json('PUT', { imageIds }))).json();
}

export async function uploadMedia(file: File): Promise<{ id: number; url: string }> {
  const form = new FormData();
  form.append('file', file);
  return (await send('/api/media', { method: 'POST', body: form })).json();
}
