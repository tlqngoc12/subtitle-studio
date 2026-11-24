import { useAdminTitle } from '../lib/useAdminTitle';
import { Archive, LoaderCircle } from 'lucide-react';
import { BackupsPanel } from '../components/settings/BackupsPanel';
import { GeminiSettingsForm } from '../components/settings/GeminiSettingsForm';
import { WritingRulesForm } from '../components/settings/WritingRulesForm';
import { SettingsTabs, type SettingsTab } from '../components/settings/SettingsTabs';
import { useBackups } from '../components/settings/useBackups';
import { Page } from '../components/ui/Page';
import { PageHeader } from '../components/ui/PageHeader';

/** Settings (admin only): one tab per group of settings, each its own route. */
export default function SettingsPage({ tab }: { tab: SettingsTab }) {
  useAdminTitle('Settings');
  const backups = useBackups(tab === 'backups');
  return (
    <Page>
      <PageHeader
        title="Settings"
        lede="Change how the app translates, keeps backups and checks writing."
        actions={
          tab === 'backups' ? (
            <button type="button" className="button button--primary" disabled={backups.running} onClick={() => void backups.start()}>
              {backups.running ? (
                <LoaderCircle className="icon icon--spin" aria-hidden="true" />
              ) : (
                <Archive className="icon" aria-hidden="true" />
              )}
              {backups.running ? 'Backing up…' : 'Backup now'}
            </button>
          ) : undefined
        }
      />
      <SettingsTabs current={tab}>
        {tab === 'gemini' && <GeminiSettingsForm />}
        {tab === 'writing-rules' && <WritingRulesForm />}
        {tab === 'backups' && <BackupsPanel status={backups.status} error={backups.error} />}
      </SettingsTabs>
    </Page>
  );
}
