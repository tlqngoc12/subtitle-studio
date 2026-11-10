import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { fakeFetch } from './test/fakeFetch';

describe('App', () => {
  it('opens a new page scrolled to the top', async () => {
    fakeFetch([]); // every request fails like a network error: the pages show their error state
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );
    scrollTo.mockClear();

    await userEvent.setup().click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Novels' }));

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
