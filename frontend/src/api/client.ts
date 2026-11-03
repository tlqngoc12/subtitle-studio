/** Typed client for the backend REST API (PLAN section 6). */

export type SourceType = 'MANUAL' | 'AUTO';

/** Where the current Vietsub came from: uploaded by hand, or translated by Gemini. */
export type ViSource = 'MANUAL' | 'AUTO';

export type TranslationStatus = 'TRANSLATING' | 'FAILED';

/** Why Lấy Engsub with a profile did not start a translation. */
export type SkipReason =
  | 'GEMINI_NOT_CONFIGURED'
  | 'VIDEO_TOO_LONG'
  | 'VIETSUB_MANUAL'
  | 'VIETSUB_EXISTS'
  | 'TRANSLATION_IN_PROGRESS';

export interface PromptProfiles {
  configured: boolean;
  profiles: string[];
}

export interface VideoDto {
  id: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  subLang: string;
  subSource: SourceType;
  cueCount: number;
  fetchedAt: string;
  thumbnailUrl: string;
  viCueCount: number;
  viUpdatedAt: string | null;
  viSource: ViSource | null;
  translationStatus: TranslationStatus | null;
  translationError: string | null;
  translationProfile: string | null;
}

/** One Vietsub line, timed by the uploaded .srt file. */
export interface ViCue {
  startMs: number;
  endMs: number;
  text: string;
}

export interface CueDto {
  idx: number;
  startMs: number;
  endMs: number;
  text: string;
}

/** One rejected input of an INVALID_BLOCK problem, e.g. `items[2].value`. */
export interface FieldError {
  field: string;
  message: string;
}

/** A failed API call. `code` comes from the ProblemDetail body; status 0 + NETWORK means no response. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly detail: string,
    readonly fieldErrors: FieldError[] = [],
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

export async function send(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e) {
    throw new ApiError(0, 'NETWORK', e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) {
    let code: string | null = null;
    let detail = res.statusText || `HTTP ${res.status}`;
    let fieldErrors: FieldError[] = [];
    try {
      const problem = await res.json();
      code = typeof problem.code === 'string' ? problem.code : null;
      detail = typeof problem.detail === 'string' ? problem.detail : detail;
      if (Array.isArray(problem.errors)) fieldErrors = problem.errors;
    } catch {
      // body was not JSON; keep the status text
    }
    throw new ApiError(res.status, code, detail, fieldErrors);
  }
  return res;
}

/** Fetches the English subtitles; with a `profile`, the backend also starts a Gemini translation when allowed. */
export async function fetchVideo(
  url: string,
  profile?: string,
): Promise<{ video: VideoDto; created: boolean; skipReason: SkipReason | null }> {
  const res = await send('/api/videos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile ? { url, profile } : { url }),
  });
  const { skipReason, ...video } = await res.json();
  return { video: video as VideoDto, created: res.status === 201, skipReason: skipReason ?? null };
}

export async function getPromptProfiles(): Promise<PromptProfiles> {
  return (await send('/api/prompt-profiles')).json();
}

/** "Dịch lại bằng Gemini": returns the video, now TRANSLATING. */
export async function translateVideo(id: string, profile: string): Promise<VideoDto> {
  return (
    await send(`/api/videos/${encodeURIComponent(id)}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    })
  ).json();
}

export async function listVideos(): Promise<VideoDto[]> {
  return (await send('/api/videos')).json();
}

export async function getCues(id: string): Promise<CueDto[]> {
  return (await send(`/api/videos/${encodeURIComponent(id)}/cues`)).json();
}

export async function refreshVideo(id: string): Promise<VideoDto> {
  return (await send(`/api/videos/${encodeURIComponent(id)}/refresh`, { method: 'POST' })).json();
}

export async function deleteVideo(id: string): Promise<void> {
  await send(`/api/videos/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function srtUrl(id: string): string {
  return `/api/videos/${encodeURIComponent(id)}/subtitle.srt`;
}

export async function getVideo(id: string): Promise<VideoDto> {
  return (await send(`/api/videos/${encodeURIComponent(id)}`)).json();
}

/** Adds or replaces the Vietsub of a video; `url` may be a YouTube link or a bare video id. */
export async function addVietsub(url: string, file: File): Promise<VideoDto> {
  const form = new FormData();
  form.append('url', url);
  form.append('file', file);
  return (await send('/api/vietsub', { method: 'POST', body: form })).json();
}

export async function getVietsub(id: string): Promise<ViCue[]> {
  return (await send(`/api/videos/${encodeURIComponent(id)}/vietsub`)).json();
}

export async function deleteVietsub(id: string): Promise<void> {
  await send(`/api/videos/${encodeURIComponent(id)}/vietsub`, { method: 'DELETE' });
}

/** Download URL of the stored Vietsub as `{title}_{id}.vi.srt`. */
export function viSrtUrl(id: string): string {
  return `/api/videos/${encodeURIComponent(id)}/subtitle.vi.srt`;
}
