import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { fakeFetch } from '../test/fakeFetch';

describe('SettingsPage routes', () => {
  const settings = {
    effective: { model: 'm', fallbackModels: [], thinkingLevel: '', temperature: 0.3, timeoutSeconds: 180, overloadCooldownMinutes: 10 },
    defaults: { model: 'm', fallbackModels: [], thinkingLevel: '', temperature: 0.3, timeoutSeconds: 180, overloadCooldownMinutes: 10 },
    overridden: [],
    configured: true,
  };

  it('/settings redirects to /settings/gemini', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/settings/gemini', status: 200, body: settings },
      { method: 'GET', path: '/api/settings/gemini/models', status: 200, body: [] },
    ]);
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Main model')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gemini' })).toHaveAttribute('aria-current', 'page');
  });

  it('has a Writing rules tab that opens its own route', async () => {
    fakeFetch([{ method: 'GET', path: '/api/settings/writing-rules', status: 200, body: { text: null } }]);
    render(
      <MemoryRouter initialEntries={['/settings/writing-rules']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('textbox', { name: 'Writing rules' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Writing rules' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Gemini' })).toHaveAttribute('href', '/settings/gemini');
  });
});
