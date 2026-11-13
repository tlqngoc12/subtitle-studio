import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { fakeFetch } from './test/fakeFetch';

describe('App', () => {
  it.each(['/works/new', '/works/5/edit', '/novels/new'])('lifts Back to top above the sticky form bar on %s', async (path) => {
    fakeFetch([]);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 2000 });
    act(() => {
      fireEvent.scroll(window);
    });

    expect(await screen.findByRole('button', { name: 'Back to top' })).toHaveClass('back-to-top--above-bar');
  });

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
