import { send } from './client';

export interface ProfileStats {
  videos: number;
  correctedLines: number;
}

/** A translation profile as stored: its text and the SHA that save must send back. */
export interface ProfileDetails {
  name: string;
  text: string;
  sha: string;
  stats: ProfileStats;
}

export interface ProfileRule {
  text: string;
  count: number;
}

/** Gemini's proposal for a new profile text; nothing is written until it is saved. */
export interface ProfileAnalysis {
  proposed: string;
  rules: ProfileRule[];
  basedOn: { videos: number; lines: number };
  model: string;
  sha: string;
}

const url = (name: string) => `/api/prompt-profiles/${encodeURIComponent(name)}`;

export async function getProfileDetails(name: string): Promise<ProfileDetails> {
  return (await send(url(name))).json();
}

/** One Gemini call; takes 10 to 60 seconds. */
export async function analyzeProfile(name: string): Promise<ProfileAnalysis> {
  return (await send(`${url(name)}/analyze`, { method: 'POST' })).json();
}

/** Saves the profile; fails with PROFILE_CHANGED (409) when the file is no longer the one with `baseSha`. */
export async function saveProfile(name: string, text: string, baseSha: string): Promise<{ sha: string }> {
  return (
    await send(url(name), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, baseSha }),
    })
  ).json();
}
