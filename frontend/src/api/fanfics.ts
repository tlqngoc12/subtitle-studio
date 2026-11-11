/** Typed client for the Fanfics API (fanfics spec). */
import { send } from './client';

/** What the card shows; the same shape for a saved story, a preview and the public export. */
export interface FanficBase {
  url: string;
  title: string;
  author: string | null;
  description: string | null;
  tags: string[];
  /** Our stored cover (`/api/media/{id}` or `/media/…`); in a preview it is Wattpad's own URL. */
  coverUrl: string | null;
  readCount: number;
  voteCount: number;
  partCount: number;
  wordCount: number;
  readingMinutes: number;
  completed: boolean;
  /** ISO instant of the latest published part; null when Wattpad does not say. */
  storyUpdatedAt: string | null;
  fetchedAt: string;
}

export interface Fanfic extends FanficBase {
  id: number;
  createdAt: string;
}

/** A story read from Wattpad but not saved yet. */
export interface FanficPreview extends FanficBase {
  id: null;
  createdAt: null;
}

export interface RefreshAllResult {
  updated: number;
  failed: { id: number; title: string; message: string }[];
}

function post(body?: unknown): RequestInit {
  return body === undefined
    ? { method: 'POST' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function listFanfics(): Promise<Fanfic[]> {
  return (await send('/api/fanfics')).json();
}

export async function previewFanfic(url: string): Promise<FanficPreview> {
  return (await send('/api/fanfics/preview', post({ url }))).json();
}

export async function addFanfic(url: string): Promise<Fanfic> {
  return (await send('/api/fanfics', post({ url }))).json();
}

export async function refreshFanfic(id: number): Promise<Fanfic> {
  return (await send(`/api/fanfics/${id}/refresh`, post())).json();
}

export async function refreshAllFanfics(): Promise<RefreshAllResult> {
  return (await send('/api/fanfics/refresh', post())).json();
}

export async function deleteFanfic(id: number): Promise<void> {
  await send(`/api/fanfics/${id}`, { method: 'DELETE' });
}
