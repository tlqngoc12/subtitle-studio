/** Typed client for the profile pages API (profiles spec section 5). */
import { send } from './client';

export type BlockType = 'TEXT' | 'IMAGE' | 'GALLERY' | 'EMBED' | 'LINKS' | 'FACTS' | 'CHIPS';

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

export type ProfileKind = 'GROUP' | 'MEMBER';

export interface Profile {
  slug: string;
  displayName: string;
  /** GROUP is EmiBonnie (banner and avatar only); MEMBER rows are the sections of the page. */
  kind: ProfileKind;
  tagline: string | null;
  fullName: string | null;
  /** Null on the public site, where only `portraitUrl` is exported. */
  portraitMediaId: number | null;
  portraitUrl: string | null;
  updatedAt: string;
  blocks: ProfileBlock[];
  /** In display order. Profile data published before the banner existed has none. */
  banner: BannerImage[];
}

/** The whole Profile page: the EmiBonnie group (banner) and the members in page order. */
export interface ProfilePage {
  group: Profile;
  members: Profile[];
}

export interface ProfileHeaderInput {
  displayName: string;
  tagline: string | null;
  fullName: string | null;
  portraitMediaId: number | null;
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

export async function getProfilePage(): Promise<ProfilePage> {
  return (await send('/api/profiles')).json();
}

export async function updateProfileHeader(slug: string, input: ProfileHeaderInput): Promise<Profile> {
  return (await send(`${base(slug)}/header`, json('PUT', input))).json();
}

export async function addMember(displayName: string): Promise<Profile> {
  return (await send('/api/profiles', json('POST', { displayName }))).json();
}

export async function deleteMember(slug: string): Promise<void> {
  await send(base(slug), { method: 'DELETE' });
}

/** `slugs` lists every member once, in the new order. */
export async function reorderMembers(slugs: string[]): Promise<Profile[]> {
  return (await send('/api/profiles/order', json('PUT', { slugs }))).json();
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

export interface UploadedMedia {
  id: number;
  url: string;
  /** Set when the server resized the image (`maxSide` given). */
  width: number | null;
  height: number | null;
}

/** With `maxSide` the server shrinks the image to that longest side and re-encodes it. */
export async function uploadMedia(file: File, maxSide?: 400 | 1600): Promise<UploadedMedia> {
  const form = new FormData();
  form.append('file', file);
  const query = maxSide ? `?maxSide=${maxSide}` : '';
  return (await send(`/api/media${query}`, { method: 'POST', body: form })).json();
}
