import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { effectiveRules, exportForAi, parseGlobalRules } from '../../lib/writingRules';
import { WRITING_RULES_SEED } from '../../lib/writingRulesSeed';
import { answerConfirm } from '../../test/confirm';
import { fakeFetch, problem, type Route } from '../../test/fakeFetch';
import { NovelProfileTab } from './NovelProfileTab';

const details = (over: Record<string, unknown> = {}, stats: Record<string, unknown> = {}) => ({
  name: 'MyGrumpyVampire',
  text: '## Xưng hô\nA gọi B là em.\n',
  sha: 'sha-1',
  stats: { chapters: 12, edits: 48, otherNovels: [], ...stats },
  geminiConfigured: true,
  ...over,
});

const analysis = (basedOn = { chapters: 12, edits: 48 }) => ({
  proposed: '## Xưng hô\nA gọi B là chị.\n',
  rules: [{ text: 'A gọi B là chị', count: 3 }],
  terms: [{ kind: 'term', text: 'Ms. Ellis → cô Ellis', count: 3 }],
  basedOn,
  model: 'gemini-test',
  sha: 'sha-1',
});

const get = (body: unknown = details(), status = 200): Route => ({
  method: 'GET',
  path: '/api/novels/3/profile',
  status,
  body,
});

function renderTab(sourceType: 'WATTPAD' | 'SCREENSHOTS' | 'ORIGINAL' = 'SCREENSHOTS') {
  return render(<NovelProfileTab novelId={3} sourceType={sourceType} />);
}

describe('NovelProfileTab', () => {
  it('showsNameAndStats', async () => {
    fakeFetch([get()]);
    renderTab();

    expect(await screen.findByText('MyGrumpyVampire.md')).toBeInTheDocument();
    expect(screen.getByText('Based on 12 published chapters · 48 edits')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Analyze corrections' })).not.toHaveAttribute('aria-disabled');
  });

  it('namesOtherNovelsSharingTheProfile', async () => {
    fakeFetch([get(details({}, { otherNovels: ['Be my Sugar!'] }))]);
    renderTab();

    expect(await screen.findByText(/incl\. chapters of Be my Sugar!/)).toBeInTheDocument();
  });

  it('noProfileShowsAlert', async () => {
    fakeFetch([get(problem(404, 'NO_PROFILE', 'This novel has no translation profile.'), 404)]);
    renderTab();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This novel has no translation profile.');
    expect(alert).toHaveTextContent('Details');
    expect(screen.queryByRole('button', { name: 'Analyze corrections' })).not.toBeInTheDocument();
  });

  it('noEditsDisablesAnalyzeWithReason', async () => {
    fakeFetch([get(details({}, { chapters: 0, edits: 0 }))]);
    renderTab('WATTPAD');

    const button = await screen.findByRole('button', { name: 'Analyze corrections' });
    await waitFor(() => expect(button).toHaveAccessibleDescription('No edited published chapters yet'));
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Chapters translated before this update keep no AI copy and are skipped.')).toBeInTheDocument();
  });

  it('noEditsHintIsOnlyForWattpad', async () => {
    fakeFetch([get(details({}, { chapters: 0, edits: 0 }))]);
    renderTab('SCREENSHOTS');

    await screen.findByText('MyGrumpyVampire.md');
    expect(screen.queryByText(/keep no AI copy/)).not.toBeInTheDocument();
  });

  it('geminiNotConfiguredDisablesAnalyze', async () => {
    fakeFetch([get(details({ geminiConfigured: false }))]);
    renderTab();

    const button = await screen.findByRole('button', { name: 'Analyze corrections' });
    await waitFor(() => expect(button).toHaveAccessibleDescription('GEMINI_API_KEY is not set'));
  });

  it('showsTermsAfterAnalyze', async () => {
    fakeFetch([get(), { method: 'POST', path: '/api/novels/3/profile/analyze', status: 200, body: analysis() }]);
    renderTab();
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Analyze corrections' });
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));

    await user.click(button);

    expect(await screen.findByRole('heading', { name: 'Terms & addressing (1)' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Terms and addressing' })).toHaveTextContent(
      'Term: Ms. Ellis → cô Ellis (×3)',
    );
    expect(screen.getByRole('list', { name: 'Rules found' })).toHaveTextContent('A gọi B là chị');
    expect(screen.getByRole('button', { name: 'Save to MyGrumpyVampire.md' })).toBeInTheDocument();
  });

  it('showsUsedOfTotalWhenLimited', async () => {
    fakeFetch([
      get(details({}, { chapters: 40, edits: 412 })),
      { method: 'POST', path: '/api/novels/3/profile/analyze', status: 200, body: analysis({ chapters: 30, edits: 300 }) },
    ]);
    renderTab();
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'Analyze corrections' });
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));

    await user.click(button);

    expect(await screen.findByText(/Used 300 of 412 edits \(newest first\)/)).toBeInTheDocument();
  });

  it('editsAndSavesTheSavedProfileWithoutAnalyze', async () => {
    const calls = fakeFetch([
      get(),
      { method: 'PUT', path: '/api/novels/3/profile', status: 200, body: { sha: 'sha-2' } },
    ]);
    renderTab();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
    await user.type(await screen.findByRole('textbox', { name: 'Profile text' }), 'XYZ');
    const saveButton = await screen.findByRole('button', { name: 'Save to MyGrumpyVampire.md' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);
    await answerConfirm('Save');

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(JSON.parse(String(calls.find((c) => c.method === 'PUT')?.body))).toEqual({
      text: '## Xưng hô\nA gọi B là em.\nXYZ',
      baseSha: 'sha-1',
    });
  });

  describe('Copy for AI', () => {
    const rulesRoute: Route = { method: 'GET', path: '/api/settings/writing-rules', status: 200, body: { text: null } };
    const PROFILE_TEXT = '## Nguyên tắc riêng\n- Emi dùng "cô"\n\n## Kiểm tra\n- "mẹ cô" → "mẹ em"\n';
    const global = () => parseGlobalRules(WRITING_RULES_SEED);

    it('copies the effective rules of an original story, with its saved profile', async () => {
      const user = userEvent.setup();
      fakeFetch([get(details({ text: PROFILE_TEXT })), rulesRoute]);
      renderTab('ORIGINAL');
      const button = await screen.findByRole('button', { name: 'Copy for AI' });
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

      await user.click(button);

      await waitFor(() => expect(writeText).toHaveBeenCalledWith(exportForAi(effectiveRules(global(), PROFILE_TEXT), true)));
      expect(writeText.mock.calls[0][0]).toContain('Sửa đúng:');
    });

    it('still exports the global rules for an original story without a profile', async () => {
      const user = userEvent.setup();
      fakeFetch([get(problem(404, 'NO_PROFILE', 'none'), 404), rulesRoute]);
      renderTab('ORIGINAL');
      const button = await screen.findByRole('button', { name: 'Copy for AI' });
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

      await user.click(button);

      await waitFor(() => expect(writeText).toHaveBeenCalledWith(exportForAi(effectiveRules(global(), null), true)));
    });

    it('is not offered for a translated novel', async () => {
      fakeFetch([get()]);
      renderTab('WATTPAD');
      await screen.findByText('MyGrumpyVampire.md');
      expect(screen.queryByRole('button', { name: 'Copy for AI' })).not.toBeInTheDocument();
    });
  });
});
