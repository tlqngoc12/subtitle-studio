import * as Tabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { TabTrigger } from '../ui/TabTrigger';
import { FanficsTab } from './FanficsTab';
import { useT } from '../../lib/i18n';

export type NovelsTab = 'translated' | 'originals' | 'fanfics';

/** The selected Novels tab, kept in `?tab=` so it survives reload and can be linked; Translated is the default. */
export function useNovelsTab(): [NovelsTab, (tab: NovelsTab) => void] {
  const [params, setParams] = useSearchParams();
  const wanted = params.get('tab');
  const tab: NovelsTab = wanted === 'fanfics' || wanted === 'originals' ? wanted : 'translated';
  const setTab = (next: NovelsTab) =>
    setParams(next === 'translated' ? {} : { tab: next }, { replace: true });
  return [tab, setTab];
}

/** Translated | Originals (the page's own content) | Fanfics, as underlined tabs shared by the admin and public Novels pages. */
export function NovelsTabs({
  tab,
  onTabChange,
  translated,
  originals,
  labels = { translated: 'Translated', originals: 'Originals', fanfics: 'Fanfics' },
}: {
  tab: NovelsTab;
  onTabChange: (tab: NovelsTab) => void;
  translated: ReactNode;
  originals: ReactNode;
  labels?: Record<NovelsTab, string>;
}) {
  return (
    <Tabs.Root value={tab} onValueChange={(v) => onTabChange(v as NovelsTab)} className="tabs">
      <Tabs.List className="tabs__list" aria-label={useT()('Novels sections', 'Các mục truyện')}>
        <TabTrigger className="tabs__tab" value="translated">
          {labels.translated}
        </TabTrigger>
        <TabTrigger className="tabs__tab" value="originals">
          {labels.originals}
        </TabTrigger>
        <TabTrigger className="tabs__tab" value="fanfics">
          {labels.fanfics}
        </TabTrigger>
      </Tabs.List>
      <Tabs.Content value="translated">{translated}</Tabs.Content>
      <Tabs.Content value="originals">{originals}</Tabs.Content>
      <Tabs.Content value="fanfics">
        <FanficsTab />
      </Tabs.Content>
    </Tabs.Root>
  );
}
