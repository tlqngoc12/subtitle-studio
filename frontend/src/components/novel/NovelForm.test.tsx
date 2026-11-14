import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { css } from '../../test/css';
import { fakeFetch } from '../../test/fakeFetch';
import { novelDetail } from '../../test/novelFixtures';
import { expectTooltip } from '../../test/tooltip';
import { NovelForm } from './NovelForm';

const profiles = { method: 'GET', path: '/api/novel-profiles', status: 200, body: { configured: true, profiles: [] } };

function renderForm(props: Partial<React.ComponentProps<typeof NovelForm>> = {}) {
  return render(
    <MemoryRouter>
      <NovelForm onSubmit={async () => {}} submitLabel="Save" pendingLabel="Saving…" {...props} />
    </MemoryRouter>,
  );
}

describe('NovelForm', () => {
  it('shows no create-a-profile hint when editing an existing Wattpad novel', async () => {
    fakeFetch([profiles]);
    renderForm({ initial: novelDetail({ sourceType: 'WATTPAD' }) });
    await screen.findByLabelText('Translation profile (optional)');

    expect(screen.queryByText(/Leave empty to create/)).not.toBeInTheDocument();
  });

  it('groups the fields under Basics, About, Links and Translation, in that order', () => {
    fakeFetch([profiles]);
    renderForm();

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Basics', 'About', 'Links', 'Translation']);
  });

  it('puts the cover column beside the other Basics fields from 1024 px, one column below', () => {
    expect(css).toMatch(/@media \(min-width: 1024px\)\s*\{[^@]*\.novel-form__basics\s*\{[^}]*grid-template-columns:\s*200px\s+minmax\(0,\s*1fr\)/);
    expect(css).not.toMatch(/\.novel-form\s*\{[^}]*max-width:\s*640px/);
    expect(css).toMatch(/\.novel-form\s*\{[^}]*max-width:\s*760px/);
  });

  it('counts the description characters', async () => {
    fakeFetch([profiles]);
    renderForm();

    expect(screen.getByText('0 / 5000')).toBeInTheDocument();
    await userEvent.setup().type(screen.getByLabelText('Description (optional)'), 'Hello');

    expect(screen.getByText('5 / 5000')).toBeInTheDocument();
  });

  it('marks Trailer and Translation profile as optional', () => {
    fakeFetch([profiles]);
    renderForm();

    expect(screen.getByLabelText('Trailer (YouTube link, optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Translation profile (optional)')).toBeInTheDocument();
  });

  it('keeps Create novel disabled with a "Title is required" tooltip until there is a title', async () => {
    fakeFetch([profiles]);
    renderForm({ submitLabel: 'Create novel' });
    const button = screen.getByRole('button', { name: 'Create novel' });

    expect(button).toBeDisabled();
    await expectTooltip(button.parentElement!, 'Title is required');

    await userEvent.setup().type(screen.getByLabelText('Title'), 'X');
    expect(button).toBeEnabled();
  });

  it('shows the title error after a submit attempt without a title and does not call onSubmit', () => {
    fakeFetch([profiles]);
    const onSubmit = vi.fn(async () => {});
    const { container } = renderForm({ onSubmit });

    fireEvent.submit(container.querySelector('form')!);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Title is required.')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
  });

  it('always has a sticky action bar', () => {
    fakeFetch([profiles]);
    renderForm();

    expect(screen.getByRole('button', { name: 'Save' }).closest('.form-actions')).toHaveClass('form-actions--sticky');
  });

  it('puts Delete novel in the bar start slot when onDelete is given, and calls it', async () => {
    fakeFetch([profiles]);
    const onDelete = vi.fn();
    renderForm({ initial: novelDetail(), onDelete });

    const del = screen.getByRole('button', { name: 'Delete novel' });
    expect(del.closest('.form-actions__start')).not.toBeNull();
    await userEvent.setup().click(del);

    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('shows Cancel as a link back when cancelTo is given', () => {
    fakeFetch([profiles]);
    renderForm({ cancelTo: '/novels' });

    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/novels');
  });

  it('sends the tags as an array, from chips', async () => {
    fakeFetch([profiles]);
    const onSubmit = vi.fn(async () => {});
    renderForm({ onSubmit, submitLabel: 'Create novel' });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Title'), 'X');
    await user.type(screen.getByLabelText('Tags (optional)'), 'romance,BL{Enter}');
    await user.click(screen.getByRole('button', { name: 'Create novel' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ tags: ['romance', 'BL'] }));
  });

  it('shows the stored tags as chips', () => {
    fakeFetch([profiles]);
    renderForm({ initial: novelDetail({ tags: ['gl', 'fluff'] }) });

    const box = screen.getByLabelText('Tags (optional)').parentElement!;
    expect(within(box).getByRole('button', { name: 'Remove tag gl' })).toBeInTheDocument();
    expect(within(box).getByRole('button', { name: 'Remove tag fluff' })).toBeInTheDocument();
  });

  it('suggests tags that other novels already use', async () => {
    const summary = { id: 1, slug: 'a', title: 'A', coverUrl: null, novelStatus: 'ONGOING', chapterCount: 0, publishedCount: 0, updatedAt: '2026-01-01T00:00:00Z', featured: false, createdAt: '2026-01-01T00:00:00Z', lastPublishedAt: null, originalAuthor: null, description: null, tags: ['Slow burn'] };
    fakeFetch([profiles, { method: 'GET', path: '/api/novels', status: 200, body: [summary] }]);
    renderForm();
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Tags (optional)'));

    expect(await screen.findByRole('option', { name: 'Slow burn' })).toBeInTheDocument();
  });
});
