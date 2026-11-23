import * as Tabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { TabTrigger } from '../ui/TabTrigger';
import { FanficsTab } from './FanficsTab';
import { useT } from '../../lib/i18n';

export type NovelsTab = 'translated' | 'originals' | 'fanfics';

export const ADMIN_NOVELS_TAB_LABELS: Record<NovelsTab, string> = {
  translated: 'Translated',
  originals: 'Originals',
  fanfics: 'Fanfics',
};

export const PUBLIC_NOVELS_TAB_LABELS: Record<NovelsTab, string> = {
  translated: 'Truyện dịch',
  originals: 'Sáng tác',
  fanfics: 'Fanfic',
};

/** The breadcrumb level between Novels and a novel: the tab the novel is listed under, as a link back to it. */
export function novelsTabCrumb(
  original: boolean,
  labels: Record<NovelsTab, string>,
): { label: string; to: string } {
  const tab: NovelsTab = original ? 'originals' : 'translated';
  return { label: labels[tab], to: `/novels?tab=${tab}` };
}

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
  labels = ADMIN_NOVELS_TAB_LABELS,
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
