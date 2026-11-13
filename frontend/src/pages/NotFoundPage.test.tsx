import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SiteProvider } from '../data/SiteContext';
import { fakeSource, publicSite } from '../test/fakeSource';
import NotFoundPage from './NotFoundPage';

describe('NotFoundPage', () => {
  it('says where to go in the admin app, with a normal link and no "Back to" wording', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    const link = screen.getByRole('link', { name: 'Go to Get Engsub' });
    expect(link).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: /^Back to/ })).not.toBeInTheDocument();
  });

  it('says where to go on the public site in Vietnamese', () => {
    render(
      <SiteProvider value={publicSite(fakeSource({}))}>
        <MemoryRouter>
          <NotFoundPage />
        </MemoryRouter>
      </SiteProvider>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Không tìm thấy trang' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Về trang Vietsub' })).toHaveAttribute('href', '/vietsub/list');
  });
});
