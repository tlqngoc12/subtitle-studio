import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SiteProvider } from '../data/SiteContext';
import { fakeSource, publicSite } from '../test/fakeSource';
import { ShowcaseTabs } from './ShowcaseTabs';
import { VietsubTabs } from './VietsubTabs';

function currentTab(ui: React.ReactNode, path: string, label: string) {
  render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
  const nav = screen.getByRole('navigation', { name: label });
  return within(nav)
    .getAllByRole('link')
    .filter((a) => a.getAttribute('aria-current') === 'page')
    .map((a) => a.textContent);
}

describe('VietsubTabs', () => {
  it('has the 5 tabs in order', () => {
    render(
      <MemoryRouter>
        <VietsubTabs />
      </MemoryRouter>,
    );
    const links = within(screen.getByRole('navigation', { name: 'Vietsub' })).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Get Engsub', 'Videos', 'Playlists', 'Profiles', 'List']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/vietsub', '/vietsub/playlists', '/vietsub/profiles', '/vietsub/list']);
  });

  it.each([
    ['/', 'Get Engsub'],
    ['/vietsub', 'Videos'],
    ['/vietsub/playlists', 'Playlists'],
    ['/vietsub/profiles', 'Profiles'],
    ['/vietsub/list', 'List'],
  ])('vietsubTabsCurrent: %s marks %s', (path, expected) => {
    expect(currentTab(<VietsubTabs />, path, 'Vietsub')).toEqual([expected]);
  });
});

describe('ShowcaseTabs', () => {
  it('showcaseTabsShownInAdmin: Profile, Works, Photos with the current one marked', () => {
    expect(currentTab(<ShowcaseTabs>body</ShowcaseTabs>, '/works', 'Showcase')).toEqual(['Works']);
    expect(screen.getByText('body')).toBeInTheDocument();
    const links = within(screen.getByRole('navigation', { name: 'Showcase' })).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Profile', 'Works', 'Photos']);
  });

  it('showcaseTabsHiddenInPublic: only the page content is rendered', () => {
    render(
      <SiteProvider value={publicSite(fakeSource({}))}>
        <MemoryRouter initialEntries={['/works']}>
          <ShowcaseTabs>
            <p>body</p>
          </ShowcaseTabs>
          <VietsubTabs>
            <p>list</p>
          </VietsubTabs>
        </MemoryRouter>
      </SiteProvider>,
    );
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
    expect(screen.getByText('list')).toBeInTheDocument();
  });
});
