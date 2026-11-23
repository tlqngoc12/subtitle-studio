import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import SettingsPage from '../../pages/SettingsPage';
import { effectiveRules, exportForAi, parseGlobalRules } from '../../lib/writingRules';
import { WRITING_RULES_SEED } from '../../lib/writingRulesSeed';
import { fakeFetch, problem, type Route } from '../../test/fakeFetch';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}));

const get = (text: string | null): Route => ({ method: 'GET', path: '/api/settings/writing-rules', status: 200, body: { text } });
const put = (status = 204, body?: unknown): Route => ({ method: 'PUT', path: '/api/settings/writing-rules', status, body });

function renderTab() {
  return render(
    <MemoryRouter initialEntries={['/settings/writing-rules']}>
      <SettingsPage tab="writing-rules" />
    </MemoryRouter>,
  );
}

const box = () => screen.findByRole('textbox', { name: 'Writing rules' }) as Promise<HTMLTextAreaElement>;

describe('Settings › Writing rules', () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it('shows the seed when the file does not exist', async () => {
    fakeFetch([get(null)]);
    renderTab();
    expect((await box()).value).toBe(WRITING_RULES_SEED);
    expect(screen.getByRole('link', { name: 'Writing rules' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the saved text', async () => {
    fakeFetch([get('## Cụm cấm\n- "x"\n')]);
    renderTab();
    expect((await box()).value).toBe('## Cụm cấm\n- "x"\n');
  });

  it('Save sends the edited text and toasts', async () => {
    const user = userEvent.setup();
    const calls = fakeFetch([get('abc'), put()]);
    renderTab();
    const text = await box();
    await user.type(text, 'd');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Writing rules saved'));
    const call = calls.filter((c) => c.method === 'PUT').at(-1);
    expect(JSON.parse(String(call?.body))).toEqual({ text: 'abcd' });
  });

  it('Ctrl+S saves', async () => {
    const user = userEvent.setup();
    const calls = fakeFetch([get('abc'), put()]);
    renderTab();
    await user.type(await box(), 'd');
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Writing rules saved'));
    expect(calls.some((c) => c.method === 'PUT')).toBe(true);
  });

  it('shows a rejected save as an alert', async () => {
    const user = userEvent.setup();
    fakeFetch([get('abc'), put(400, problem(400, 'WRITING_RULES_TOO_LONG', 'too long'))]);
    renderTab();
    await user.type(await box(), 'd');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('too long');
  });

  it('Copy for AI copies the unsaved text', async () => {
    const user = userEvent.setup();
    fakeFetch([get('## Cụm cấm\n- "a"\n')]);
    renderTab();
    const text = await box();
    await user.type(text, '- "b"');
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await user.click(screen.getByRole('button', { name: 'Copy for AI' }));
    const expected = exportForAi(effectiveRules(parseGlobalRules(text.value), null), false);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expected));
    expect(toast.success).toHaveBeenCalledWith(`Copied ${expected.length} characters`);
  });

  it('explains the sections', async () => {
    fakeFetch([get(null)]);
    renderTab();
    const help = (await box()).getAttribute('aria-describedby');
    const hint = document.getElementById(String(help)) as HTMLElement;
    for (const h of ['## Nguyên tắc viết', '## Cụm cấm', '## Chi tiết cấm']) {
      expect(hint).toHaveTextContent(h);
    }
  });
});
