/** Typed client for the playlist API (playlists spec section 4). */
import { send, type VideoDto } from './client';

export interface PlaylistSummary {
  id: number;
  name: string;
  description: string | null;
  videoCount: number;
  /** The first video's thumbnail; null for an empty playlist. */
  thumbnailUrl: string | null;
  updatedAt: string;
  /** Only present when the list was asked for a video (Save to playlist). */
  containsVideo?: boolean;
}

export interface PlaylistDetail {
  id: number;
  name: string;
  description: string | null;
  updatedAt: string;
  /** In playlist order. */
  videos: VideoDto[];
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function listPlaylists(videoId?: string): Promise<PlaylistSummary[]> {
  const query = videoId ? `?videoId=${encodeURIComponent(videoId)}` : '';
  return (await send(`/api/playlists${query}`)).json();
}

export async function createPlaylist(name: string, description?: string): Promise<PlaylistDetail> {
  return (await send('/api/playlists', json('POST', description ? { name, description } : { name }))).json();
}

export async function getPlaylist(id: number): Promise<PlaylistDetail> {
  return (await send(`/api/playlists/${id}`)).json();
}

export async function updatePlaylist(id: number, patch: { name?: string; description?: string }): Promise<PlaylistDetail> {
  return (await send(`/api/playlists/${id}`, json('PATCH', patch))).json();
}

export async function deletePlaylist(id: number): Promise<void> {
  await send(`/api/playlists/${id}`, { method: 'DELETE' });
}

export async function addToPlaylist(id: number, videoId: string): Promise<PlaylistDetail> {
  return (await send(`/api/playlists/${id}/videos`, json('POST', { videoId }))).json();
}

export async function removeFromPlaylist(id: number, videoId: string): Promise<void> {
  await send(`/api/playlists/${id}/videos/${encodeURIComponent(videoId)}`, { method: 'DELETE' });
}

export async function reorderPlaylist(id: number, videoIds: string[]): Promise<PlaylistDetail> {
  return (await send(`/api/playlists/${id}/order`, json('PUT', { videoIds }))).json();
}

/** "1 video", "3 videos". */
export function videoCountLabel(n: number, vi = false): string {
  if (vi) return `${n} video`;
  return n === 1 ? '1 video' : `${n} videos`;
}
