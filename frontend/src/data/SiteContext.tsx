import { createContext, useContext, type ReactNode } from 'react';
import { apiSource } from './apiSource';
import type { ReadSource } from './types';

/** Which app a page runs in: the admin app (API, editable) or the public site (static JSON, read-only). */
export interface Site {
  source: ReadSource;
  /** Hides every editing control and admin link. */
  readOnly: boolean;
  /** Where the app name in the top bar leads. */
  homePath: string;
}

const ADMIN: Site = { source: apiSource, readOnly: false, homePath: '/' };

const SiteContext = createContext<Site>(ADMIN);

export function SiteProvider({ value, children }: { value: Site; children: ReactNode }) {
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

/** The current site; without a provider this is the admin app. */
export function useSite(): Site {
  return useContext(SiteContext);
}
