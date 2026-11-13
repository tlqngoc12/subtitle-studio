import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { fakeFetch } from '../../test/fakeFetch';
import { novelDetail } from '../../test/novelFixtures';
import { NovelForm } from './NovelForm';

const profiles = { method: 'GET', path: '/api/novel-profiles', status: 200, body: { configured: true, profiles: [] } };

describe('NovelForm', () => {
  it('shows no create-a-profile hint when editing an existing Wattpad novel', async () => {
    fakeFetch([profiles]);
    render(
      <MemoryRouter>
        <NovelForm initial={novelDetail({ sourceType: 'WATTPAD' })} onSubmit={async () => {}} submitLabel="Save"
          pendingLabel="Saving…" />
      </MemoryRouter>,
    );
    await screen.findByLabelText('Translation profile');

    expect(screen.queryByText(/Leave empty to create/)).not.toBeInTheDocument();
  });
});
