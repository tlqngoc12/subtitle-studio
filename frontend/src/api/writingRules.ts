import { send } from './client';

/** The global writing rules file; null when it does not exist yet (callers fall back to the seed). */
export async function getWritingRules(): Promise<string | null> {
  const body: { text: string | null } = await (await send('/api/settings/writing-rules')).json();
  return body.text;
}

/** Replaces the file. Fails with WRITING_RULES_TOO_LONG (400) beyond 20,000 characters. */
export async function saveWritingRules(text: string): Promise<void> {
  await send('/api/settings/writing-rules', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}
