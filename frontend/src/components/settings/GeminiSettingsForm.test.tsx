import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { GeminiSettingsDto, GeminiValues } from '../../api/settings';
import { fakeFetch, problem, type Route } from '../../test/fakeFetch';
import { pickOption } from '../../test/select';
import SettingsPage from '../../pages/SettingsPage';

const DEFAULTS: GeminiValues = {
  model: 'gemini-main',
  fallbackModels: ['gemini-f1', 'gemini-f2'],
  thinkingLevel: 'low',
  temperature: 0.3,
  timeoutSeconds: 180,
  overloadCooldownMinutes: 10,
};

function dto(effective: Partial<GeminiValues> = {}, overridden: string[] = [], configured = true): GeminiSettingsDto {
  return { effective: { ...DEFAULTS, ...effective }, defaults: DEFAULTS, overridden, configured };
}

const settings = (body: GeminiSettingsDto = dto()): Route => ({ method: 'GET', path: '/api/settings/gemini', status: 200, body });
const modelsRoute = (body: string[] | null = ['gemini-main', 'gemini-f1', 'gemini-other']): Route =>
  body === null
    ? { method: 'GET', path: '/api/settings/gemini/models', status: 500, body: problem(500, 'INTERNAL_ERROR', 'x') }
    : { method: 'GET', path: '/api/settings/gemini/models', status: 200, body };
const put = (status = 200, body: unknown = dto()): Route => ({ method: 'PUT', path: '/api/settings/gemini', status, body });

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/settings/gemini']}>
      <SettingsPage tab="gemini" />
    </MemoryRouter>,
  );
}

async function loaded() {
  await screen.findByLabelText('Main model');
}

function saved(calls: ReturnType<typeof fakeFetch>): GeminiValues {
  const call = calls.filter((c) => c.method === 'PUT').at(-1);
  return JSON.parse(String(call?.body));
}

describe('Settings › Gemini', () => {
  it('rendersEffectiveValuesAndDefaults', async () => {
    fakeFetch([
      settings(dto({ model: 'gemini-custom', temperature: 0.7 }, ['gemini.model', 'gemini.temperature'])),
      modelsRoute(),
    ]);
    renderForm();
    await loaded();

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByLabelText('Main model')).toHaveValue('gemini-custom');
    expect(screen.getByText(/Default: gemini-main/)).toBeInTheDocument();
    expect(screen.getByLabelText('Temperature')).toHaveValue(0.7);
    expect(screen.getByText(/Default: 0.3/)).toBeInTheDocument();
    expect(screen.getByLabelText('Timeout (seconds)')).toHaveValue('180');
    expect(screen.getByLabelText('Overload rest (minutes)')).toHaveValue('10');
    expect(screen.getByRole('combobox', { name: 'Thinking level' })).toHaveTextContent('Default (low)');
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('gemini-f1'),
      expect.stringContaining('gemini-f2'),
    ]);
    // Reset only where the value is not the default.
    expect(screen.getByRole('button', { name: 'Reset main model' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset temperature' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset timeout' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('reorderAndRemoveFallback', async () => {
    const user = userEvent.setup();
    const calls = fakeFetch([settings(), modelsRoute(), put()]);
    renderForm();
    await loaded();

    await user.click(screen.getByRole('button', { name: 'Move gemini-f2 up' }));
    expect(within(screen.getByRole('list')).getAllByRole('listitem')[0]).toHaveTextContent('gemini-f2');
    await user.click(screen.getByRole('button', { name: 'Remove gemini-f1' }));
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saved(calls).fallbackModels).toEqual(['gemini-f2']));
  });

  it('adds a fallback model typed or picked, and not the main model twice', async () => {
    const user = userEvent.setup();
    const calls = fakeFetch([settings(), modelsRoute(), put()]);
    renderForm();
    await loaded();

    const add = screen.getByRole('combobox', { name: 'Add a fallback model' });
    await user.type(add, 'gemini-main');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await user.clear(add);
    await user.type(add, 'my-new-model');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saved(calls).fallbackModels).toEqual(['gemini-f1', 'gemini-f2', 'my-new-model']));
  });

  it('resetFieldSendsDefault', async () => {
    const user = userEvent.setup();
    const calls = fakeFetch([
      settings(dto({ model: 'gemini-custom' }, ['gemini.model'])),
      modelsRoute(),
      put(),
    ]);
    renderForm();
    await loaded();

    await user.click(screen.getByRole('button', { name: 'Reset main model' }));
    expect(screen.getByLabelText('Main model')).toHaveValue('gemini-main');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saved(calls).model).toBe('gemini-main'));
  });

  it('freeTextModelAccepted: a name that is not in the list is saved as typed', async () => {
    const user = userEvent.setup();
    const calls = fakeFetch([settings(), modelsRoute(), put()]);
    renderForm();
    await loaded();

    const model = screen.getByLabelText('Main model');
    await user.clear(model);
    await user.type(model, 'gemini-brand-new');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saved(calls).model).toBe('gemini-brand-new'));
  });

  it('sends every field: thinking level, temperature, timeout and rest', async () => {
    const user = userEvent.setup();
    const calls = fakeFetch([settings(), modelsRoute(), put()]);
    renderForm();
    await loaded();

    await pickOption(user, screen.getByRole('combobox', { name: 'Thinking level' }), 'high');
    const temperature = screen.getByLabelText('Temperature');
    await user.clear(temperature);
    await user.type(temperature, '0.8');
    const timeout = screen.getByLabelText('Timeout (seconds)');
    await user.clear(timeout);
    await user.type(timeout, '90');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(saved(calls)).toEqual({ ...DEFAULTS, thinkingLevel: 'high', temperature: 0.8, timeoutSeconds: 90 }),
    );
  });

  it('showsFieldError: a 400 names the field it belongs to', async () => {
    const user = userEvent.setup();
    fakeFetch([
      settings(),
      modelsRoute(),
      put(400, { ...problem(400, 'INVALID_SETTING', 'The main model cannot also be a fallback model.'), field: 'fallbackModels' }),
    ]);
    renderForm();
    await loaded();

    await user.click(screen.getByRole('button', { name: 'Remove gemini-f1' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('The main model cannot also be a fallback model.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('cancel puts the saved values back', async () => {
    const user = userEvent.setup();
    fakeFetch([settings(), modelsRoute()]);
    renderForm();
    await loaded();

    const model = screen.getByLabelText('Main model');
    await user.type(model, 'x');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByLabelText('Main model')).toHaveValue('gemini-main');
  });

  it('tells the user translation is off without a key, and that the model list could not load', async () => {
    fakeFetch([settings(dto({}, [], false)), modelsRoute([])]);
    renderForm();
    await loaded();

    expect(screen.getByText('Translation is off until GEMINI_API_KEY is set.')).toBeInTheDocument();
    expect(screen.getByText(/Could not load the model list/)).toBeInTheDocument();
  });

  it('the model list failing is not an error: the field stays a text box', async () => {
    fakeFetch([settings(), modelsRoute(null)]);
    renderForm();
    await loaded();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Main model')).toBeEnabled();
  });

  it('shows the load error when the settings cannot be read', async () => {
    fakeFetch([
      { method: 'GET', path: '/api/settings/gemini', status: 500, body: problem(500, 'INTERNAL_ERROR', 'x') },
      modelsRoute(),
    ]);
    renderForm();

    expect(await screen.findByRole('alert')).toHaveTextContent('The server ran into an error.');
  });
});
