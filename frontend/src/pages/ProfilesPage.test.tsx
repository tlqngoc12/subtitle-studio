import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { answerConfirm } from '../test/confirm';
import { fakeFetch, problem, type Route as FakeRoute } from '../test/fakeFetch';
import { pickOption } from '../test/select';
import { expectTooltip } from '../test/tooltip';
import ProfilesPage from './ProfilesPage';

function renderPage(entry = '/vietsub/profiles?profile=EmiBonnie') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/vietsub/profiles" element={<ProfilesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const CURRENT = 'Intro\nl1\nl2\nl3\nl4\nl5\nl6\nl7\nEmi gọi Bonnie là em.\n';
const PROPOSED = 'Intro\nl1\nl2\nl3\nl4\nl5\nl6\nl7\nEmi gọi Bonnie là chị.\nThêm quy tắc mới.\n';

const details = (correctedLines = 612, text = CURRENT) => ({
  name: 'EmiBonnie',
  text,
  sha: 'sha-1',
  stats: { videos: 34, correctedLines },
});

const analysis = {
  proposed: PROPOSED,
  rules: [{ text: 'Emi gọi Bonnie là chị', count: 47 }],
  basedOn: { videos: 34, lines: 300 },
  model: 'gemini-test',
  sha: 'sha-1',
};

const list = (configured = true): FakeRoute => ({
  method: 'GET',
  path: '/api/prompt-profiles',
  status: 200,
  body: { configured, profiles: ['EmiBonnie', 'Other'] },
});
const get = (body = details()): FakeRoute => ({ method: 'GET', path: '/api/prompt-profiles/EmiBonnie', status: 200, body });
const analyzeRoute = (status = 200, body: unknown = analysis): FakeRoute => ({
  method: 'POST',
  path: '/api/prompt-profiles/EmiBonnie/analyze',
  status,
  body,
});

async function analyze(user: ReturnType<typeof userEvent.setup>) {
  const button = await screen.findByRole('button', { name: 'Analyze corrections' });
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
  await user.click(button);
  await screen.findByRole('region', { name: 'Changes to the profile' });
}

describe('ProfilesPage', () => {
  it('shows the Profiles tab as current and the stats of the chosen profile', async () => {
    fakeFetch([list(), get()]);
    renderPage();

    const tabs = screen.getByRole('navigation', { name: 'Vietsub' });
    expect(within(tabs).getByRole('link', { name: 'Profiles' })).toHaveAttribute('aria-current', 'page');
    expect(within(tabs).getByRole('link', { name: 'Videos' })).not.toHaveAttribute('aria-current');
    expect(await screen.findByText('34 videos · 612 corrected lines')).toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: 'Profile' })).toHaveTextContent('EmiBonnie');
  });

  it('loads a profile chosen in the list and clears it with "Choose a profile…"', async () => {
    fakeFetch([list(), get()]);
    renderPage('/vietsub/profiles');
    const user = userEvent.setup();
    const select = await screen.findByRole('combobox', { name: 'Profile' });
    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveTextContent('Choose a profile…');

    await pickOption(user, select, 'EmiBonnie');

    expect(await screen.findByText('34 videos · 612 corrected lines')).toBeInTheDocument();
    expect(select).toHaveTextContent('EmiBonnie');

    await pickOption(user, select, 'Choose a profile…');

    await waitFor(() => expect(screen.queryByText('34 videos · 612 corrected lines')).not.toBeInTheDocument());
  });

  it('puts the profile select before Analyze corrections in the toolbar', async () => {
    fakeFetch([list(), get()]);
    renderPage();

    const select = await screen.findByRole('combobox', { name: 'Profile' });
    const analyze = screen.getByRole('button', { name: 'Analyze corrections' });
    expect(select.compareDocumentPosition(analyze) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(select.closest('.toolbar')).not.toBeNull();
    expect(analyze.closest('.toolbar')).toBe(select.closest('.toolbar'));
  });

  it('disables Analyze with a reason when no profile is chosen', async () => {
    fakeFetch([list()]);
    renderPage('/vietsub/profiles');

    const button = await screen.findByRole('button', { name: 'Analyze corrections' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Choose a profile first');
    await expectTooltip(button, 'Choose a profile first');
  });

  it('disables Analyze when there are no corrected lines', async () => {
    fakeFetch([list(), get(details(0))]);
    renderPage();

    const button = await screen.findByRole('button', { name: 'Analyze corrections' });
    await waitFor(() => expect(button).toHaveAccessibleDescription('No corrected lines yet'));
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('disables Analyze when Gemini is not configured', async () => {
    fakeFetch([list(false), get()]);
    renderPage();

    const button = await screen.findByRole('button', { name: 'Analyze corrections' });
    await waitFor(() => expect(button).toHaveAccessibleDescription('GEMINI_API_KEY is not set'));
  });

  it('does not call analyze while the button is unavailable', async () => {
    const calls = fakeFetch([list(), get(details(0)), analyzeRoute()]);
    renderPage();
    const button = await screen.findByRole('button', { name: 'Analyze corrections' });
    await waitFor(() => expect(button).toHaveAccessibleDescription('No corrected lines yet'));

    await userEvent.setup().click(button);

    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('shows the rules and a highlighted diff with the unchanged run folded', async () => {
    fakeFetch([list(), get(), analyzeRoute()]);
    renderPage();
    const user = userEvent.setup();

    await analyze(user);

    const rules = screen.getByRole('list', { name: 'Rules found' });
    expect(within(rules).getByText('Emi gọi Bonnie là chị')).toBeInTheDocument();
    expect(within(rules).getByText('×47')).toBeInTheDocument();
    expect(screen.getByText(/Based on 300 lines from 34 videos/)).toHaveTextContent('model gemini-test');

    const diff = screen.getByRole('region', { name: 'Changes to the profile' });
    expect(diff.querySelector('del')).toHaveTextContent('Removed: Emi gọi Bonnie là em.');
    expect(diff.querySelector('del .pdiff__word')?.textContent?.trim()).toBe('em');
    expect(diff.querySelector('ins')).toHaveTextContent('Added: Emi gọi Bonnie là chị.');
    expect(diff.querySelector('ins .pdiff__word')?.textContent?.trim()).toBe('chị');
    expect(diff.textContent).toContain('Thêm quy tắc mới.');

    const fold = within(diff).getByRole('button', { name: '… 8 unchanged lines' });
    expect(diff.textContent).not.toContain('l4');
    await user.click(fold);
    expect(diff.textContent).toContain('l4');
  });

  it('shows the waiting state while Gemini works', async () => {
    let release!: () => void;
    const delay = new Promise<void>((resolve) => (release = resolve));
    fakeFetch([list(), get(), { ...analyzeRoute(), delay }]);
    renderPage();
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Analyze corrections' });
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));

    await user.click(button);

    expect(await screen.findByRole('button', { name: 'Analyzing…' })).toBeInTheDocument();
    expect(screen.getByText('This can take up to a minute.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Profile' })).toBeDisabled();
    release();
    await screen.findByRole('region', { name: 'Changes to the profile' });
  });

  it('shows an alert when Gemini fails', async () => {
    fakeFetch([list(), get(), analyzeRoute(502, problem(502, 'GEMINI_FAILED', 'Gemini is busy right now'))]);
    renderPage();
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Analyze corrections' });
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));

    await user.click(button);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Gemini could not finish the analysis.');
    expect(alert).toHaveTextContent('Gemini is busy right now');
  });

  it('editing updates the diff after a short pause', async () => {
    fakeFetch([list(), get(), analyzeRoute()]);
    renderPage();
    const user = userEvent.setup();
    await analyze(user);

    await user.click(screen.getByRole('button', { name: 'Edit before saving' }));
    const text = screen.getByRole('textbox', { name: 'Profile text' });
    expect(text).toHaveValue(PROPOSED);
    await user.type(text, 'Dòng gõ thêm.');

    const diff = screen.getByRole('region', { name: 'Changes to the profile' });
    await waitFor(() => expect(diff.querySelector('ins')?.textContent).toContain('Dòng gõ thêm.'));
  });

  it('saves the proposal with the base sha after confirming, and shows a toast', async () => {
    const success = vi.spyOn(toast, 'success');
    const calls = fakeFetch([
      list(),
      get(),
      analyzeRoute(),
      { method: 'PUT', path: '/api/prompt-profiles/EmiBonnie', status: 200, body: { sha: 'sha-2' } },
    ]);
    renderPage();
    const user = userEvent.setup();
    await analyze(user);

    await user.click(screen.getByRole('button', { name: 'Save to EmiBonnie.md' }));
    await answerConfirm('Save', 'Overwrite EmiBonnie.md?');

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Changes to the profile' })).not.toBeInTheDocument());
    const put = calls.find((c) => c.method === 'PUT');
    expect(JSON.parse(String(put?.body))).toEqual({ text: PROPOSED, baseSha: 'sha-1' });
    await waitFor(() => expect(success).toHaveBeenCalledWith('Profile saved', { description: 'EmiBonnie.md · previous version kept in history' }));
  });

  it('saves the edited text', async () => {
    const calls = fakeFetch([
      list(),
      get(),
      analyzeRoute(),
      { method: 'PUT', path: '/api/prompt-profiles/EmiBonnie', status: 200, body: { sha: 'sha-2' } },
    ]);
    renderPage();
    const user = userEvent.setup();
    await analyze(user);
    await user.click(screen.getByRole('button', { name: 'Edit before saving' }));
    await user.type(screen.getByRole('textbox', { name: 'Profile text' }), 'XYZ');

    await user.click(screen.getByRole('button', { name: 'Save to EmiBonnie.md' }));
    await answerConfirm('Save');

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(JSON.parse(String(calls.find((c) => c.method === 'PUT')?.body)).text).toBe(`${PROPOSED}XYZ`);
  });

  it('keeps the result and explains a 409', async () => {
    fakeFetch([
      list(),
      get(),
      analyzeRoute(),
      { method: 'PUT', path: '/api/prompt-profiles/EmiBonnie', status: 409, body: problem(409, 'PROFILE_CHANGED', 'changed') },
    ]);
    renderPage();
    const user = userEvent.setup();
    await analyze(user);

    await user.click(screen.getByRole('button', { name: 'Save to EmiBonnie.md' }));
    await answerConfirm('Save');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The file changed on disk since you opened it.');
    expect(alert).toHaveTextContent('Reload and analyze again.');
  });

  it('Cancel drops the result without asking when nothing was edited', async () => {
    fakeFetch([list(), get(), analyzeRoute()]);
    renderPage();
    const user = userEvent.setup();
    await analyze(user);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Changes to the profile' })).not.toBeInTheDocument();
  });

  it('Cancel asks first after an edit, and keeps the result on "No"', async () => {
    fakeFetch([list(), get(), analyzeRoute()]);
    renderPage();
    const user = userEvent.setup();
    await analyze(user);
    await user.click(screen.getByRole('button', { name: 'Edit before saving' }));
    await user.type(screen.getByRole('textbox', { name: 'Profile text' }), '!');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await answerConfirm('Cancel', 'Discard your edits?');

    expect(screen.getByRole('textbox', { name: 'Profile text' })).toHaveValue(`${PROPOSED}!`);
  });

  it('Cancel drops an edited result when confirmed', async () => {
    fakeFetch([list(), get(), analyzeRoute()]);
    renderPage();
    const user = userEvent.setup();
    await analyze(user);
    await user.click(screen.getByRole('button', { name: 'Edit before saving' }));
    await user.type(screen.getByRole('textbox', { name: 'Profile text' }), '!');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await answerConfirm('Discard', 'Discard your edits?');

    expect(screen.queryByRole('region', { name: 'Changes to the profile' })).not.toBeInTheDocument();
  });
});
