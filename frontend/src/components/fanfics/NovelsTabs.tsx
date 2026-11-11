import * as Tabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { TabTrigger } from '../ui/TabTrigger';
import { FanficsTab } from './FanficsTab';

export type NovelsTab = 'translated' | 'fanfics';

/** The selected Novels tab, kept in `?tab=` so it survives reload and can be linked; Translated is the default. */
export function useNovelsTab(): [NovelsTab, (tab: NovelsTab) => void] {
  const [params, setParams] = useSearchParams();
  const tab: NovelsTab = params.get('tab') === 'fanfics' ? 'fanfics' : 'translated';
  const setTab = (next: NovelsTab) =>
    setParams(next === 'fanfics' ? { tab: 'fanfics' } : {}, { replace: true });
  return [tab, setTab];
}

/** Translated (the page's own content) | Fanfics, as underlined tabs shared by the admin and public Novels pages. */
export function NovelsTabs({
  tab,
  onTabChange,
  translated,
}: {
  tab: NovelsTab;
  onTabChange: (tab: NovelsTab) => void;
  translated: ReactNode;
}) {
  return (
    <Tabs.Root value={tab} onValueChange={(v) => onTabChange(v as NovelsTab)} className="tabs">
      <Tabs.List className="tabs__list" aria-label="Novels sections">
        <TabTrigger className="tabs__tab" value="translated">
          Translated
        </TabTrigger>
        <TabTrigger className="tabs__tab" value="fanfics">
          Fanfics
        </TabTrigger>
      </Tabs.List>
      <Tabs.Content value="translated">{translated}</Tabs.Content>
      <Tabs.Content value="fanfics">
        <FanficsTab />
      </Tabs.Content>
    </Tabs.Root>
  );
}
