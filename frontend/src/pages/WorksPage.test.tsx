import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { WorkSummary } from '../api/works';
import { SiteProvider } from '../data/SiteContext';
import { fakeFetch, type Route as FakeRoute } from '../test/fakeFetch';
import { fakeSource, publicSite } from '../test/fakeSource';
import { page, profile } from '../test/profileFixtures';
import { workSummary } from '../test/workFixtures';
import WorksPage from './WorksPage';

const PROFILES = page([profile('emi', 'Emi', []), profile('bonnie', 'Bonnie', [])]);
const WORKS: WorkSummary[] = [
  workSummary(1, { title: 'Coming film', releaseDate: null, profile: 'bonnie' }),
  workSummary(2, { title: 'Old song', categories: ['MUSIC'], profile: 'bonnie', subcategory: 'OST', releaseDate: '2026-01-05' }),
  workSummary(3, { title: 'Emi show', categories: ['VARIETY'], profile: 'emi' }),
  workSummary(4, { title: 'New song', categories: ['MUSIC'], profile: 'emi' }),
];

function renderPublic(works = WORKS, path = '/works') {
  const source = fakeSource({ listWorks: async () => works, getProfilePage: async () => PROFILES });
  return render(
    <SiteProvider value={publicSite(source)}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/works" element={<WorksPage />} />
        </Routes>
      </MemoryRouter>
    </SiteProvider>,
  );
}

const titles = () => screen.getAllByRole('link', { name: /^(Coming|Old|Emi show|New)/ }).map((l) => l.getAttribute('aria-label'));

describe('WorksPage', () => {
  it('shows every work with Coming Soon, dates, chips and the profile badge', async () => {
    renderPublic();

    await screen.findByRole('link', { name: 'Coming film' });
    expect(titles()).toEqual(['Coming film', 'Old song', 'Emi show', 'New song']);
    const first = screen.getByRole('link', { name: 'Coming film' });
    expect(within(first).getByText('Coming Soon')).toBeInTheDocument();
    expect(within(first).getByText('Bonnie')).toBeInTheDocument();
    const second = screen.getByRole('link', { name: 'Old song' });
    expect(within(second).getByText('5 Jan 2026')).toBeInTheDocument();
    expect(within(second).getByText('Music')).toBeInTheDocument();
    expect(within(second).getByText('OST')).toBeInTheDocument();
    expect(screen.getByText('Series, music, shows and more.')).toBeInTheDocument();
  });

  it('filters by person and category together', async () => {
    renderPublic(WORKS, '/works?who=bonnie&cat=MUSIC');

    await screen.findByRole('link', { name: 'Old song' });
    expect(titles()).toEqual(['Old song']);
    expect(screen.queryByText('1 work')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Bonnie' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('changes filters from the pills and avatars', async () => {
    renderPublic();
    await screen.findByRole('link', { name: 'Coming film' });

    await userEvent.click(screen.getByRole('button', { name: 'Music' }));
    expect(titles()).toEqual(['Old song', 'New song']);
    await userEvent.click(screen.getByRole('button', { name: 'Emi' }));
    expect(titles()).toEqual(['New song']);
    await userEvent.click(screen.getAllByRole('button', { name: 'All' })[0]);
    expect(titles()).toEqual(['Old song', 'New song']);
  });

  it('?cat= keeps every work whose categories contain it, and a card shows all its category chips', async () => {
    const both = workSummary(5, { title: 'New song film', categories: ['FILM_TV', 'MUSIC'], releaseDate: '2026-03-01' });
    renderPublic([...WORKS, both], '/works?cat=MUSIC');

    await screen.findByRole('link', { name: 'New song film' });
    expect(titles()).toEqual(['Old song', 'New song', 'New song film']);
    const card = screen.getByRole('link', { name: 'New song film' });
    expect(within(card).getByText('Film & TV')).toBeInTheDocument();
    expect(within(card).getByText('Music')).toBeInTheDocument();
  });

  it('links each card to its page and has no admin controls on the public site', async () => {
    renderPublic();

    expect(await screen.findByRole('link', { name: 'Old song' })).toHaveAttribute('href', '/works/2');
    expect(screen.queryByRole('link', { name: 'Add work' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'People' })).not.toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    renderPublic([]);

    expect(await screen.findByText('No works here yet.')).toBeInTheDocument();
  });
});

describe('WorksPage admin', () => {
  it('shows Add work and an Edit link on every card', async () => {
    const routes: FakeRoute[] = [
      { method: 'GET', path: '/api/works', status: 200, body: WORKS },
      { method: 'GET', path: '/api/profiles', status: 200, body: PROFILES },
    ];
    fakeFetch(routes);
    render(
      <MemoryRouter initialEntries={['/works']}>
        <Routes>
          <Route path="/works" element={<WorksPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('link', { name: 'Old song' });
    expect(screen.getByRole('link', { name: 'Add work' })).toHaveAttribute('href', '/works/new');
    expect(screen.getByRole('link', { name: 'Edit Old song' })).toHaveAttribute('href', '/works/2/edit');
  });

  it('a member also gets the works tagged with the group; the group gets only its own', async () => {
    const group = workSummary(6, { title: 'Both show', profile: 'emibonnie' });
    renderPublic([...WORKS, group], '/works?who=emi');

    await screen.findByRole('link', { name: 'Both show' });
    expect(titles()).toEqual(['Emi show', 'New song']);
    expect(screen.getAllByRole('link', { name: /^Both/ })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Bonnie' }));
    expect(titles()).toEqual(['Coming film', 'Old song']);

    await userEvent.click(screen.getByRole('button', { name: 'EmiBonnie' }));
    expect(screen.getAllByRole('link').filter((l) => l.getAttribute('href')?.startsWith('/works/'))).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Both show' })).toBeInTheDocument();
  });
});
