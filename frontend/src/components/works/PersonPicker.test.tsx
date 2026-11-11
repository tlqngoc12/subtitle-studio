import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeFetch } from '../../test/fakeFetch';
import { person } from '../../test/workFixtures';
import { PersonPicker } from './PersonPicker';

const PEOPLE = [person(1, 'Bonnie'), person(2, 'Emi'), person(3, 'Chợ Đêm')];

async function open(exclude: number[] = []) {
  const onPick = vi.fn();
  render(<PersonPicker exclude={exclude} onPick={onPick} />);
  await userEvent.click(screen.getByRole('button', { name: 'Person' }));
  await screen.findByLabelText('Search people');
  return onPick;
}

describe('PersonPicker', () => {
  it('filters the directory as you type, ignoring accents and case', async () => {
    fakeFetch([{ method: 'GET', path: '/api/people', status: 200, body: PEOPLE }]);
    await open();
    await screen.findByRole('button', { name: 'Emi' });

    await userEvent.type(screen.getByLabelText('Search people'), 'bon');
    expect(screen.getByRole('button', { name: 'Bonnie' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Emi' })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Search people'));
    await userEvent.type(screen.getByLabelText('Search people'), 'cho dem');
    expect(screen.getByRole('button', { name: 'Chợ Đêm' })).toBeInTheDocument();
  });

  it('leaves out people who are already credited', async () => {
    fakeFetch([{ method: 'GET', path: '/api/people', status: 200, body: PEOPLE }]);
    await open([1]);

    expect(await screen.findByRole('button', { name: 'Emi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bonnie' })).not.toBeInTheDocument();
  });

  it('picks a person', async () => {
    fakeFetch([{ method: 'GET', path: '/api/people', status: 200, body: PEOPLE }]);
    const onPick = await open();

    await userEvent.click(await screen.findByRole('button', { name: 'Emi' }));

    expect(onPick).toHaveBeenCalledWith(PEOPLE[1]);
  });

  it('creates a new person with an avatar resized to 400, then picks them', async () => {
    const created = person(9, 'Any', { avatarMediaId: 5, avatarUrl: '/api/media/5' });
    const calls = fakeFetch([
      { method: 'GET', path: '/api/people', status: 200, body: PEOPLE },
      { method: 'POST', path: '/api/media?maxSide=400', status: 201, body: { id: 5, url: '/api/media/5', width: 1, height: 1 } },
      { method: 'POST', path: '/api/people', status: 201, body: created },
    ]);
    const onPick = await open();
    await screen.findByRole('button', { name: 'Emi' });

    await userEvent.type(screen.getByLabelText('Search people'), 'Any');
    await userEvent.click(screen.getByRole('button', { name: 'Create “Any”' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Any');
    await userEvent.upload(screen.getByLabelText('Avatar file'), new File(['x'], 'a.png', { type: 'image/png' }));
    await screen.findByRole('img', { name: 'Selected image' });
    await userEvent.click(screen.getByRole('button', { name: 'Create person' }));

    await vi.waitFor(() => expect(onPick).toHaveBeenCalledWith(created));
    const post = calls.find((c) => c.method === 'POST' && c.path === '/api/people');
    expect(JSON.parse(String(post?.body))).toEqual({ name: 'Any', avatarMediaId: 5 });
  });

  it('does not offer Create for a name that already exists, even for an excluded person', async () => {
    fakeFetch([{ method: 'GET', path: '/api/people', status: 200, body: PEOPLE }]);
    await open([2]);
    await screen.findByRole('button', { name: 'Bonnie' });

    await userEvent.type(screen.getByLabelText('Search people'), 'bonnie');
    expect(screen.queryByRole('button', { name: /^Create/ })).not.toBeInTheDocument();

    // Emi is left out of the list (already credited) but still exists.
    await userEvent.clear(screen.getByLabelText('Search people'));
    await userEvent.type(screen.getByLabelText('Search people'), 'emi');
    expect(screen.queryByRole('button', { name: /^Create/ })).not.toBeInTheDocument();
  });
});
