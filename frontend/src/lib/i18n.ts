import { useCallback } from 'react';
import { useSite } from '../data/SiteContext';

/**
 * Picks the wording for the current site: the admin app is English, the public (read-only) site is Vietnamese.
 * The top menu labels are the one exception and stay English on both. User-entered content is never translated.
 */
export type Translate = (en: string, vi: string) => string;

export function useT(): Translate {
  const { readOnly } = useSite();
  return useCallback((en, vi) => (readOnly ? vi : en), [readOnly]);
}
