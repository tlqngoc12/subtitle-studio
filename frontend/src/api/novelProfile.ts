import { afterTranslateStart } from '../lib/geminiQuota';
import { send } from './client';

export interface NovelProfileStats {
  /** Published chapters with at least one corrected paragraph. */
  chapters: number;
  edits: number;
  /** Other novels whose chapters count because they share the profile name. */
  otherNovels: string[];
}

/** A novel's translation profile as stored: its text and the SHA that save must send back. */
export interface NovelProfileDetails {
  name: string;
  text: string;
  sha: string;
  stats: NovelProfileStats;
  geminiConfigured: boolean;
}

export interface NovelProfileTerm {
  kind: 'term' | 'addressing';
  text: string;
  count: number;
}

/** Gemini's proposal for a new profile text; nothing is written until it is saved. */
export interface NovelProfileAnalysis {
  proposed: string;
  rules: { text: string; count: number }[];
  terms: NovelProfileTerm[];
  basedOn: { chapters: number; edits: number };
  model: string;
  sha: string;
}

const url = (novelId: number) => `/api/novels/${novelId}/profile`;

/** Fails with NO_PROFILE (404) when the novel has no profile file. */
export async function getNovelProfile(novelId: number): Promise<NovelProfileDetails> {
  return (await send(url(novelId))).json();
}

/** One Gemini call; takes 10 to 60 seconds. */
export async function analyzeNovelProfile(novelId: number): Promise<NovelProfileAnalysis> {
  return (await afterTranslateStart(send(`${url(novelId)}/analyze`, { method: 'POST' }))).json();
}

/** Saves the profile; fails with PROFILE_CHANGED (409) when the file is no longer the one with `baseSha`. */
export async function saveNovelProfile(novelId: number, text: string, baseSha: string): Promise<{ sha: string }> {
  return (
    await send(url(novelId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, baseSha }),
    })
  ).json();
}
