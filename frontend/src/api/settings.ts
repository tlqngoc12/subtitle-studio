import { send } from './client';

/** One snapshot of the Gemini settings, as the backend reports it. `thinkingLevel` is "" when none is sent. */
export interface GeminiValues {
  model: string;
  fallbackModels: string[];
  thinkingLevel: string;
  temperature: number;
  timeoutSeconds: number;
  overloadCooldownMinutes: number;
}

export interface GeminiSettingsDto {
  /** What is in force now (application.yml plus the saved overrides). */
  effective: GeminiValues;
  /** The application.yml values: what Reset goes back to. */
  defaults: GeminiValues;
  /** Keys with a saved override, such as `gemini.model`. */
  overridden: string[];
  /** True when GEMINI_API_KEY is set. The key itself never reaches the browser. */
  configured: boolean;
}

export async function getGeminiSettings(): Promise<GeminiSettingsDto> {
  return (await send('/api/settings/gemini')).json();
}

/** Saves every field; a field equal to its default removes its override. Fails with INVALID_SETTING (400) + `extra.field`. */
export async function saveGeminiSettings(values: GeminiValues): Promise<GeminiSettingsDto> {
  return (
    await send('/api/settings/gemini', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
  ).json();
}

/** The models Gemini offers for generateContent; an empty list when it cannot be loaded (the form then takes free text). */
export async function getGeminiModels(): Promise<string[]> {
  try {
    return await (await send('/api/settings/gemini/models')).json();
  } catch {
    return [];
  }
}
