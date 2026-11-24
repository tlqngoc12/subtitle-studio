import * as Tabs from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { useScrollableTabs } from '../../lib/useScrollableTabs';

/** The underline tab row (`tabs__list`) of a Radix `Tabs.Root`; scrolls sideways on a phone, see {@link useScrollableTabs}. */
export function TabsList(props: Omit<ComponentProps<typeof Tabs.List>, 'className' | 'ref'>) {
  const ref = useScrollableTabs<HTMLDivElement>();
  return <Tabs.List {...props} ref={ref} className="tabs__list" />;
}

/** The underline tab row for tabs that are routes (links); same behaviour as {@link TabsList}. */
export function TabsNav(props: Omit<ComponentProps<'nav'>, 'className' | 'ref'>) {
  const ref = useScrollableTabs<HTMLElement>();
  return <nav {...props} ref={ref} className="tabs__list" />;
}
