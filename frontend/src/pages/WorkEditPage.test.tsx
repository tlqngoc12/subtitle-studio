import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { answerConfirm } from '../test/confirm';
import { fakeFetch, problem, type Route as FakeRoute } from '../test/fakeFetch';
import { page, profile } from '../test/profileFixtures';
import { person, work, workSummary } from '../test/workFixtures';
import WorkEditPage from './WorkEditPage';

function Where() {
  return <output aria-label="path">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/works/new" element={<WorkEditPage />} />
        <Route path="/works/:id/edit" element={<WorkEditPage />} />
        <Route path="/works" element={<div>grid</div>} />
        <Route path="/works/:id" element={<div>detail</div>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

const SUPPORT: FakeRoute[] = [
  { method: 'GET', path: '/api/profiles', status: 200, body: page([profile('emi', 'Emi', [])]) },
  { method: 'GET', path: '/api/works', status: 200, body: [workSummary(1, { categories: ['FILM_TV'], subcategory: 'Drama' })] },
];

describe('WorkEditPage', () => {
  it('opens the subcategory list on focus and follows the chosen categories, keeping a typed value', async () => {
    fakeFetch(SUPPORT);
    renderAt('/works/new');
    const box = await screen.findByRole('combobox', { name: 'Subcategory' });

    await userEvent.click(box);
    expect(await screen.findByRole('option', { name: 'Series' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Drama' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Single' })).not.toBeInTheDocument();
    await userEvent.type(box, 'Remixed');
    await userEvent.keyboard('{Escape}');

    await userEvent.click(within(screen.getByRole('group', { name: 'Categories' })).getByRole('button', { name: /Music/ }));
    await userEvent.click(box);
    expect(await screen.findByRole('option', { name: 'Single' })).toBeInTheDocument();
    expect(box).toHaveValue('Remixed');
  });

  it('saves a new work with releaseDate null when the date is empty and goes to its page', async () => {
    const calls = fakeFetch([...SUPPORT, { method: 'POST', path: '/api/works', status: 201, body: work(7) }]);
    renderAt('/works/new');

    await userEvent.type(await screen.findByLabelText('Title'), '  New film ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByLabelText('path')).toHaveTextContent('/works/7'));
    const post = calls.find((c) => c.method === 'POST' && c.path === '/api/works');
    expect(JSON.parse(String(post?.body))).toEqual({
      title: 'New film',
      coverMediaId: null,
      releaseDate: null,
      categories: ['FILM_TV'],
      subcategory: null,
      profile: null,
      description: null,
      links: [],
      credits: [],
    });
  });

  it('sends links and credits and offers the subcategory suggestions of the category', async () => {
    const calls = fakeFetch([
      ...SUPPORT,
      { method: 'GET', path: '/api/people', status: 200, body: [person(2, 'Bonnie')] },
      { method: 'POST', path: '/api/works', status: 201, body: work(8) },
    ]);
    renderAt('/works/new');
    await userEvent.type(await screen.findByLabelText('Title'), 'Show');
    await userEvent.click(screen.getByRole('combobox', { name: 'Subcategory' }));
    expect(await screen.findByRole('option', { name: 'Drama' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByRole('button', { name: 'Trailer' }));
    await userEvent.type(screen.getByLabelText('URL 1'), 'https://youtu.be/dQw4w9WgXcQ');
    await userEvent.click(screen.getByRole('button', { name: 'Person' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Bonnie' }));
    await userEvent.type(screen.getByLabelText('Role of Bonnie'), 'Lead');
    await userEvent.type(screen.getByLabelText('Character of Bonnie'), 'Key');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/works')).toBe(true));
    const body = JSON.parse(String(calls.find((c) => c.method === 'POST' && c.path === '/api/works')?.body));
    expect(body.links).toEqual([{ kind: 'TRAILER', label: 'Trailer', url: 'https://youtu.be/dQw4w9WgXcQ', icon: null }]);
    expect(body.credits).toEqual([{ personId: 2, role: 'Lead', characterName: 'Key' }]);
  });

  it('shows a server error under the matching link row and stays on the page', async () => {
    fakeFetch([
      ...SUPPORT,
      {
        method: 'POST',
        path: '/api/works',
        status: 400,
        body: { ...problem(400, 'INVALID_WORK', 'x'), errors: [{ field: 'links[1].url', message: 'Links must start with http:// or https://' }] },
      },
    ]);
    renderAt('/works/new');
    await userEvent.type(await screen.findByLabelText('Title'), 'Show');
    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await userEvent.type(screen.getByLabelText('Label 1'), 'A');
    await userEvent.type(screen.getByLabelText('Label 2'), 'B');
    await userEvent.type(screen.getByLabelText('URL 1'), 'https://a.example');
    await userEvent.type(screen.getByLabelText('URL 2'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Links must start with http:// or https://')).toBeInTheDocument();
    expect(screen.getByLabelText('URL 2')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('URL 1')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('path')).toHaveTextContent('/works/new');
  });

  it('loads a work for editing, clears characters out of the request when Film & TV is toggled off', async () => {
    const existing = work(5, {
      title: 'Love Story',
      categories: ['FILM_TV'],
      releaseDate: '2026-04-24',
      links: [{ kind: 'PILOT', label: 'Pilot', url: 'https://a.example', icon: null }],
      credits: [{ person: person(2, 'Bonnie'), role: 'Lead', characterName: 'Key' }],
    });
    const calls = fakeFetch([
      ...SUPPORT,
      { method: 'GET', path: '/api/works/5', status: 200, body: existing },
      { method: 'PUT', path: '/api/works/5', status: 200, body: existing },
    ]);
    const user = userEvent.setup();
    renderAt('/works/5/edit');

    expect(await screen.findByLabelText('Title')).toHaveValue('Love Story');
    expect(screen.getByLabelText('Release date')).toHaveValue('24/04/2026');
    expect(screen.getByLabelText('Label 1')).toHaveValue('Pilot');
    expect(screen.getByLabelText('Character of Bonnie')).toHaveValue('Key');
    await user.click(screen.getByRole('button', { name: 'Music' }));
    expect(screen.getByLabelText('Character of Bonnie')).toBeInTheDocument();
    expect(screen.queryByText('Character names are removed for non-film works.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Film & TV' }));
    expect(screen.queryByLabelText('Character of Bonnie')).not.toBeInTheDocument();
    expect(screen.getByText('Character names are removed for non-film works.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const body = JSON.parse(String(calls.find((c) => c.method === 'PUT')?.body));
    expect(body.categories).toEqual(['MUSIC']);
    expect(body.credits).toEqual([{ personId: 2, role: 'Lead', characterName: null }]);
  });

  it('cannot remove the last category', async () => {
    fakeFetch(SUPPORT);
    renderAt('/works/new');
    await screen.findByLabelText('Title');

    await userEvent.click(screen.getByRole('button', { name: 'Film & TV' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Choose at least one category.');
    expect(screen.getByRole('button', { name: 'Film & TV' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the character field as soon as Film & TV is toggled on and sends several categories in order', async () => {
    const calls = fakeFetch([
      ...SUPPORT,
      { method: 'GET', path: '/api/works/5', status: 200, body: work(5, { categories: ['MUSIC'], credits: [{ person: person(2, 'Bonnie'), role: 'Singer', characterName: null }] }) },
      { method: 'PUT', path: '/api/works/5', status: 200, body: work(5) },
    ]);
    renderAt('/works/5/edit');
    await screen.findByLabelText('Title');
    expect(screen.queryByLabelText('Character of Bonnie')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Film & TV' }));
    await userEvent.type(screen.getByLabelText('Character of Bonnie'), 'Key');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const body = JSON.parse(String(calls.find((c) => c.method === 'PUT')?.body));
    expect(body.categories).toEqual(['MUSIC', 'FILM_TV']);
    expect(body.credits[0].characterName).toBe('Key');
  });

  it('clearing the release date saves releaseDate null', async () => {
    const calls = fakeFetch([
      ...SUPPORT,
      { method: 'GET', path: '/api/works/5', status: 200, body: work(5, { releaseDate: '2026-04-24' }) },
      { method: 'PUT', path: '/api/works/5', status: 200, body: work(5, { releaseDate: null }) },
    ]);
    renderAt('/works/5/edit');
    await screen.findByLabelText('Title');

    await userEvent.click(screen.getByRole('button', { name: 'Open calendar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Release date')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(JSON.parse(String(calls.find((c) => c.method === 'PUT')?.body)).releaseDate).toBeNull();
  });

  it('creating a person from the People picker does not submit the work form', async () => {
    const created = person(9, 'Any');
    const calls = fakeFetch([
      ...SUPPORT,
      { method: 'GET', path: '/api/people', status: 200, body: [person(2, 'Bonnie')] },
      { method: 'POST', path: '/api/people', status: 201, body: created },
      { method: 'POST', path: '/api/works', status: 201, body: work(7) },
      { method: 'PUT', path: '/api/works/7', status: 200, body: work(7) },
    ]);
    renderAt('/works/new');
    await userEvent.type(await screen.findByLabelText('Title'), 'Show');

    await userEvent.click(screen.getByRole('button', { name: 'Person' }));
    await screen.findByRole('button', { name: 'Bonnie' });
    await userEvent.type(screen.getByLabelText('Search people'), 'Any');
    await userEvent.click(screen.getByRole('button', { name: 'Create “Any”' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create person' }));

    expect(await screen.findByLabelText('Role of Any')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/people')).toBe(true);
    expect(calls.some((c) => (c.method === 'POST' || c.method === 'PUT') && c.path.startsWith('/api/works'))).toBe(false);
    expect(screen.getByLabelText('path')).toHaveTextContent('/works/new');
    expect(within(screen.getByRole('main')).getByRole('heading', { name: 'Add work' })).toBeInTheDocument();
  });

  it('deletes the work after confirming and returns to the grid', async () => {
    const calls = fakeFetch([
      ...SUPPORT,
      { method: 'GET', path: '/api/works/5', status: 200, body: work(5, { title: 'Love Story' }) },
      { method: 'DELETE', path: '/api/works/5', status: 204 },
    ]);
    renderAt('/works/5/edit');
    await screen.findByLabelText('Title');

    await userEvent.click(screen.getByRole('button', { name: 'Delete work' }));
    await answerConfirm('Delete', 'Delete “Love Story”?');

    await waitFor(() => expect(screen.getByLabelText('path')).toHaveTextContent(/^\/works$/));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
  });

  it('shows Work not found for an unknown work', async () => {
    fakeFetch([...SUPPORT, { method: 'GET', path: '/api/works/9', status: 404, body: problem(404, 'WORK_NOT_FOUND', 'x') }]);
    renderAt('/works/9/edit');

    expect(await screen.findByRole('heading', { name: 'Work not found' })).toBeInTheDocument();
  });
});
