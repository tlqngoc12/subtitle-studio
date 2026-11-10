import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { answerConfirm } from '../test/confirm';
import { fakeFetch, problem, type Route as FakeRoute } from '../test/fakeFetch';
import { pickOption } from '../test/select';
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
  { method: 'GET', path: '/api/works', status: 200, body: [workSummary(1, { category: 'FILM_TV', subcategory: 'Drama' })] },
];

describe('WorkEditPage', () => {
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
      category: 'FILM_TV',
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
    const { container } = renderAt('/works/new');
    await userEvent.type(await screen.findByLabelText('Title'), 'Show');
    await waitFor(() => expect(container.querySelector('datalist option[value="Drama"]')).not.toBeNull());

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

  it('loads a work for editing, clears characters out of the request when the category leaves Film & TV', async () => {
    const existing = work(5, {
      title: 'Love Story',
      category: 'FILM_TV',
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
    expect(screen.getByLabelText('Release date')).toHaveValue('2026-04-24');
    expect(screen.getByLabelText('Label 1')).toHaveValue('Pilot');
    await pickOption(user, screen.getByLabelText('Category'), 'Music');
    expect(screen.queryByLabelText('Character of Bonnie')).not.toBeInTheDocument();
    expect(screen.getByText('Character names are removed for non-film works.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const body = JSON.parse(String(calls.find((c) => c.method === 'PUT')?.body));
    expect(body.category).toBe('MUSIC');
    expect(body.credits).toEqual([{ personId: 2, role: 'Lead', characterName: null }]);
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
