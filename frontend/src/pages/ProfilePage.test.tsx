import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { fakeFetch, problem, type Route as FakeRoute } from '../test/fakeFetch';
import { block, profile, SUMMARIES } from '../test/profileFixtures';
import ProfilePage from './ProfilePage';

function Location() {
  return <output aria-label="path">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profiles" element={<Navigate to="/profiles/emibonnie" replace />} />
        <Route path="/profiles/:slug" element={<ProfilePage />} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );
}

const LIST: FakeRoute = { method: 'GET', path: '/api/profiles', status: 200, body: SUMMARIES };
const EMIBONNIE: FakeRoute = {
  method: 'GET',
  path: '/api/profiles/emibonnie',
  status: 200,
  body: profile('emibonnie', 'EmiBonnie', [block({ id: 1, type: 'TEXT', title: 'Giới thiệu', body: 'Cặp đôi GL' })]),
};
const EMI: FakeRoute = {
  method: 'GET',
  path: '/api/profiles/emi',
  status: 200,
  body: profile('emi', 'Emi', [block({ id: 2, type: 'TEXT', body: 'Trang của Emi' })]),
};

describe('ProfilePage', () => {
  it('opens EmiBonnie from /profiles', async () => {
    fakeFetch([LIST, EMIBONNIE]);
    renderAt('/profiles');

    expect(await screen.findByRole('heading', { level: 1, name: 'EmiBonnie' })).toBeInTheDocument();
    expect(screen.getByLabelText('path')).toHaveTextContent('/profiles/emibonnie');
    expect(await screen.findByText('Cặp đôi GL')).toBeInTheDocument();
  });

  it('switches profiles with the tabs', async () => {
    fakeFetch([LIST, EMIBONNIE, EMI]);
    renderAt('/profiles/emibonnie');
    const tabs = await screen.findByRole('navigation', { name: 'Profile' });
    expect(await within(tabs).findByRole('link', { name: 'EmiBonnie' })).toHaveAttribute('aria-current', 'page');

    await userEvent.click(within(tabs).getByRole('link', { name: 'Emi' }));

    expect(await screen.findByText('Trang của Emi')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Emi' })).toBeInTheDocument();
    expect(within(tabs).getByRole('link', { name: 'Emi' })).toHaveAttribute('aria-current', 'page');
  });

  it('explains an unknown profile', async () => {
    fakeFetch([
      LIST,
      { method: 'GET', path: '/api/profiles/nobody', status: 404, body: problem(404, 'PROFILE_NOT_FOUND', 'x') },
    ]);
    renderAt('/profiles/nobody');

    expect(await screen.findByText('Không tìm thấy profile.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về EmiBonnie' })).toHaveAttribute('href', '/profiles/emibonnie');
  });

  it('reports a network error', async () => {
    fakeFetch([]);
    renderAt('/profiles/emi');

    expect(await screen.findByText('Không kết nối được máy chủ.')).toBeInTheDocument();
  });
});
