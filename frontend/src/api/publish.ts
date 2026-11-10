/** Publishing the public site to Cloudflare Pages (public site spec section 6). */
import { send } from './client';

export interface PublishStatus {
  status: 'IDLE' | 'PUBLISHING' | 'DONE' | 'FAILED';
  /** False until CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and SUBTITLESTUDIO_PUBLISH_PROJECT are set. */
  configured: boolean;
  lastPublishedAt: string | null;
  /** The site address; null while not configured. */
  url: string | null;
  /** Why the last publish failed (safe to show). */
  error: string | null;
  /** Files in the site of the latest publish; null before the first one. */
  fileCount?: number | null;
}

export async function getPublishStatus(): Promise<PublishStatus> {
  return (await send('/api/publish')).json();
}

export async function startPublish(): Promise<PublishStatus> {
  return (await send('/api/publish', { method: 'POST' })).json();
}
