/** Which Gemini models are out of quota right now (kept in the backend's memory; the call never reaches Gemini). */
export interface GeminiQuota {
  exhausted: { model: string; kind: 'DAILY' | 'MINUTE'; resetAt: string }[];
  nowUsing: string | null;
}

/** Plain fetch (not the shared client) so this module imports nothing that translate actions import. */
export async function getGeminiQuota(): Promise<GeminiQuota> {
  const res = await fetch('/api/gemini/quota');
  if (!res.ok) throw new Error(`Quota request failed (${res.status})`);
  return res.json();
}
