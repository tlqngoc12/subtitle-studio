import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { answerConfirm } from '../../test/confirm';
import { ProfileAnalyzePanel, type PanelAnalysis } from './ProfileAnalyzePanel';

const SAVED = '## Intro\n## Xưng hô\nA gọi B là em.\n## Tên riêng\nEllis\n';
const PROPOSED = '## Intro\nA gọi B là chị.\n## Tên riêng\nEllis\n';

const analysis: PanelAnalysis & { terms: string[] } = {
  proposed: PROPOSED,
  rules: [{ text: 'A gọi B là chị', count: 3 }],
  sha: 'sha-1',
  model: 'gemini-test',
  terms: ['Ellis → cô Ellis'],
};

function setup(over: Partial<Parameters<typeof ProfileAnalyzePanel<typeof analysis>>[0]> = {}) {
  const analyze = vi.fn().mockResolvedValue(analysis);
  const save = vi.fn().mockResolvedValue({ sha: 'sha-2' });
  const onSaved = vi.fn();
  render(
    <ProfileAnalyzePanel
      name="MyProfile"
      text={SAVED}
      sha="sha-1"
      stats="Based on 2 chapters · 5 edits"
      disabledReason={null}
      analyze={analyze}
      save={save}
      onSaved={onSaved}
      basedOnNote={() => 'Based on 5 edits'}
      extra={(a) => <p>Terms: {a.terms.join(', ')}</p>}
      {...over}
    />,
  );
  return { analyze, save, onSaved };
}

async function runAnalyze(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Analyze corrections' }));
  await screen.findByRole('region', { name: 'Changes to the profile' });
}

describe('ProfileAnalyzePanel', () => {
  it('analyzeShowsRulesAndDiff', async () => {
    const { analyze } = setup();
    const user = userEvent.setup();

    expect(screen.getByText('Based on 2 chapters · 5 edits')).toBeInTheDocument();
    await runAnalyze(user);

    expect(analyze).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('list', { name: 'Rules found' })).toHaveTextContent('A gọi B là chị×3');
    expect(screen.getByText('Terms: Ellis → cô Ellis')).toBeInTheDocument();
    expect(screen.getByText(/Based on 5 edits/)).toHaveTextContent('model gemini-test');
    const diff = screen.getByRole('region', { name: 'Changes to the profile' });
    expect(diff.querySelector('ins')?.textContent).toContain('chị');
  });

  it('diffShowsRemovedSection', async () => {
    setup();
    const user = userEvent.setup();

    await runAnalyze(user);

    const diff = screen.getByRole('region', { name: 'Changes to the profile' });
    const removed = Array.from(diff.querySelectorAll('del')).map((d) => d.textContent ?? '');
    expect(removed.join('\n')).toContain('## Xưng hô');
    expect(diff.querySelector('del')).toHaveTextContent('Removed:');
  });

  it('saveSendsProposalWithBaseSha', async () => {
    const { save, onSaved } = setup();
    const user = userEvent.setup();
    await runAnalyze(user);

    await user.click(screen.getByRole('button', { name: 'Save to MyProfile.md' }));
    await answerConfirm('Save', 'Overwrite MyProfile.md?');

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(PROPOSED, 'sha-1');
    expect(screen.queryByRole('region', { name: 'Changes to the profile' })).not.toBeInTheDocument();
  });

  it('directEditSavesSavedTextChanges', async () => {
    const { analyze, save, onSaved } = setup({ allowDirectEdit: true });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    const box = await screen.findByRole('textbox', { name: 'Profile text' });
    expect(box).toHaveValue(SAVED);
    expect(screen.getByText(/No changes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save to MyProfile.md' })).toBeDisabled();
    await user.type(box, 'XYZ');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save to MyProfile.md' })).toBeEnabled());
    expect(screen.getByRole('region', { name: 'Changes to the profile' }).querySelector('ins')).toHaveTextContent('XYZ');

    await user.click(screen.getByRole('button', { name: 'Save to MyProfile.md' }));
    await answerConfirm('Save');

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith(`${SAVED}XYZ`, 'sha-1');
    expect(analyze).not.toHaveBeenCalled();
  });

  it('conflictOnSaveShowsAlert', async () => {
    const save = vi.fn().mockRejectedValue(new ApiError(409, 'PROFILE_CHANGED', 'changed'));
    const { onSaved } = setup({ save });
    const user = userEvent.setup();
    await runAnalyze(user);

    await user.click(screen.getByRole('button', { name: 'Save to MyProfile.md' }));
    await answerConfirm('Save');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The file changed on disk since you opened it.');
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Changes to the profile' })).toBeInTheDocument();
  });

  it('disabledReasonDisablesAnalyze', async () => {
    const { analyze } = setup({ disabledReason: 'No edited published chapters yet' });
    const user = userEvent.setup();

    const button = screen.getByRole('button', { name: 'Analyze corrections' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('No edited published chapters yet');
    await user.click(button);

    expect(analyze).not.toHaveBeenCalled();
  });
});
