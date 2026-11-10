import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeFetch, problem } from '../../test/fakeFetch';
import { profile } from '../../test/profileFixtures';
import { MemberHeaderEditor } from './MemberHeaderEditor';

const EMI = profile('emi', 'Emi', [], [], { tagline: 'Old tag', fullName: 'Old Name' });

function setup(p = EMI) {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  render(<MemberHeaderEditor profile={p} onSaved={onSaved} onCancel={onCancel} />);
  return { onSaved, onCancel };
}

describe('MemberHeaderEditor', () => {
  it('saves trimmed values and null for blanks', async () => {
    const saved = { ...EMI, displayName: 'Emi N', tagline: null };
    const calls = fakeFetch([{ method: 'PUT', path: '/api/profiles/emi/header', status: 200, body: saved }]);
    const { onSaved } = setup();

    await userEvent.clear(screen.getByLabelText('Display name'));
    await userEvent.type(screen.getByLabelText('Display name'), '  Emi N ');
    await userEvent.clear(screen.getByLabelText('Tagline'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(JSON.parse(String(calls[0].body))).toEqual({
      displayName: 'Emi N',
      tagline: null,
      fullName: 'Old Name',
      portraitMediaId: null,
    });
    expect(onSaved).toHaveBeenCalledWith(saved);
  });

  it('shows the server error under Tagline and stays open', async () => {
    fakeFetch([
      {
        method: 'PUT',
        path: '/api/profiles/emi/header',
        status: 400,
        body: { ...problem(400, 'INVALID_BLOCK', 'x'), errors: [{ field: 'tagline', message: 'Longer than 300 characters' }] },
      },
    ]);
    const { onSaved } = setup();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Longer than 300 characters')).toBeInTheDocument();
    expect(screen.getByLabelText('Tagline')).toHaveAttribute('aria-invalid', 'true');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('uploads the portrait resized to 1600', async () => {
    const calls = fakeFetch([
      { method: 'POST', path: '/api/media?maxSide=1600', status: 201, body: { id: 9, url: '/api/media/9', width: 1200, height: 1600 } },
    ]);
    setup();

    await userEvent.upload(screen.getByLabelText('Choose image'), new File(['x'], 'a.png', { type: 'image/png' }));

    expect(await screen.findByRole('img', { name: 'Selected image' })).toHaveAttribute('src', '/api/media/9');
    expect(calls[0].path).toBe('/api/media?maxSide=1600');
  });

  it('hides Tagline and Full name for the group', () => {
    setup(profile('emibonnie', 'EmiBonnie', []));

    expect(screen.queryByLabelText('Tagline')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
    expect(screen.getByText('Used as the EmiBonnie avatar in filters')).toBeInTheDocument();
  });
});
