import type { ReactNode } from 'react';
import { Link } from 'react-router';

export type SettingsTab = 'gemini' | 'backups';

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'backups', label: 'Backups' },
];

/**
 * Gemini · Backups under the Settings heading. Each tab is its own route (links, so Back and new tabs work), drawn
 * as the same underline tabs as the Vietsub pages; the open one is underlined.
 */
export function SettingsTabs({ current, children }: { current: SettingsTab; children?: ReactNode }) {
  return (
    <div className="tabs">
      <nav className="tabs__list" aria-label="Settings">
        {TABS.map((t) => (
          <Link key={t.id} className="tabs__tab" to={`/settings/${t.id}`} aria-current={t.id === current ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="tabs__body">{children}</div>
    </div>
  );
}
