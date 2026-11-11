import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { answerConfirm } from '../../test/confirm';
import { fakeFetch, problem } from '../../test/fakeFetch';
import { person } from '../../test/workFixtures';
import { AppToaster } from '../AppToaster';
import { PeopleDialog } from './PeopleDialog';

const PEOPLE = [person(1, 'Bonnie'), person(2, 'Emi')];

function setup() {
  render(
    <>
      <AppToaster />
      <PeopleDialog open onOpenChange={() => {}} />
    </>,
  );
}

describe('PeopleDialog', () => {
  it('lists the directory', async () => {
    fakeFetch([{ method: 'GET', path: '/api/people', status: 200, body: PEOPLE }]);
    setup();

    expect(await screen.findByText('Bonnie')).toBeInTheDocument();
    expect(screen.getByText('Emi')).toBeInTheDocument();
  });

  it('renames a person and saves the trimmed name', async () => {
    const calls = fakeFetch([
      { method: 'GET', path: '/api/people', status: 200, body: PEOPLE },
      { method: 'PUT', path: '/api/people/1', status: 200, body: person(1, 'Bonnie N') },
    ]);
    setup();
    await screen.findByText('Bonnie');

    await userEvent.click(screen.getByRole('button', { name: 'Rename Bonnie' }));
    const input = screen.getByLabelText('Name of Bonnie');
    await userEvent.clear(input);
    await userEvent.type(input, '  Bonnie N ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Bonnie N')).toBeInTheDocument();
    const put = calls.find((c) => c.method === 'PUT');
    expect(JSON.parse(String(put?.body))).toEqual({ name: 'Bonnie N', avatarMediaId: null });
  });

  it('shows the duplicate-name error and keeps the form open', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/people', status: 200, body: PEOPLE },
      {
        method: 'PUT',
        path: '/api/people/1',
        status: 400,
        body: { ...problem(400, 'INVALID_WORK', 'x'), errors: [{ field: 'name', message: 'A person with this name already exists.' }] },
      },
    ]);
    setup();
    await screen.findByText('Bonnie');

    await userEvent.click(screen.getByRole('button', { name: 'Rename Bonnie' }));
    const input = screen.getByLabelText('Name of Bonnie');
    await userEvent.clear(input);
    await userEvent.type(input, 'Emi');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('A person with this name already exists.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name of Bonnie')).toHaveAttribute('aria-invalid', 'true');
  });

  it('changes the avatar through a 400 px upload', async () => {
    const calls = fakeFetch([
      { method: 'GET', path: '/api/people', status: 200, body: PEOPLE },
      { method: 'POST', path: '/api/media?maxSide=400', status: 201, body: { id: 8, url: '/api/media/8', width: 1, height: 1 } },
      { method: 'PUT', path: '/api/people/2', status: 200, body: person(2, 'Emi', { avatarMediaId: 8, avatarUrl: '/api/media/8' }) },
    ]);
    setup();
    await screen.findByText('Emi');

    await userEvent.click(screen.getByRole('button', { name: 'Change avatar of Emi' }));
    await userEvent.upload(screen.getByLabelText('Avatar of Emi file'), new File(['x'], 'a.png', { type: 'image/png' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.method === 'PUT');
    expect(JSON.parse(String(put?.body))).toEqual({ name: 'Emi', avatarMediaId: 8 });
  });

  it('deletes an unused person after confirming', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/people', status: 200, body: PEOPLE },
      { method: 'DELETE', path: '/api/people/2', status: 204 },
    ]);
    setup();
    await screen.findByText('Emi');

    await userEvent.click(screen.getByRole('button', { name: 'Delete Emi' }));
    await answerConfirm('Delete', 'Delete Emi?');

    await waitFor(() => expect(screen.queryByText('Emi')).not.toBeInTheDocument());
  });

  it('keeps a person that is in use and lists the works in a toast', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/people', status: 200, body: PEOPLE },
      { method: 'DELETE', path: '/api/people/2', status: 409, body: problem(409, 'PERSON_IN_USE', 'Used by: Alpha, Zeta') },
    ]);
    setup();
    await screen.findByText('Emi');

    await userEvent.click(screen.getByRole('button', { name: 'Delete Emi' }));
    await answerConfirm('Delete');

    expect(await screen.findByText('Used by: Alpha, Zeta')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'People' });
    expect(within(dialog).getByText('Emi')).toBeInTheDocument();
  });
});
