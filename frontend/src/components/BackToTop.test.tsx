import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteProvider } from '../data/SiteContext';
import { fakeSource } from '../test/fakeSource';
import { BackToTop } from './BackToTop';

const scrollTo = vi.fn();

function scrollTop(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
  act(() => {
    fireEvent.scroll(window);
  });
}

function setup(path = '/works', props: Parameters<typeof BackToTop>[0] = {}, readOnly = false) {
  return render(
    <SiteProvider value={{ source: fakeSource({}), readOnly, homePath: '/' }}>
      <MemoryRouter initialEntries={[path]}>
        <BackToTop {...props} />
        <main>content</main>
      </MemoryRouter>
    </SiteProvider>,
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  scrollTo.mockClear();
});
afterEach(() => {
  document.documentElement.classList.remove('player-filled-open');
  document.body.removeAttribute('data-scroll-locked');
  vi.unstubAllGlobals();
});

describe('BackToTop', () => {
  it('appears only after about a screen of scrolling and goes away near the top', async () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Back to top' })).not.toBeInTheDocument();

    scrollTop(500);
    expect(screen.queryByRole('button', { name: 'Back to top' })).not.toBeInTheDocument();

    scrollTop(900);
    expect(await screen.findByRole('button', { name: 'Back to top' })).toBeInTheDocument();

    scrollTop(600); // still past half a screen: stays
    expect(screen.getByRole('button', { name: 'Back to top' })).toBeInTheDocument();

    scrollTop(100);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Back to top' })).not.toBeInTheDocument());
  });

  it('scrolls to the top smoothly and moves focus to main', async () => {
    setup();
    scrollTop(2000);

    await userEvent.click(await screen.findByRole('button', { name: 'Back to top' }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('scrolls at once with reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    setup();
    scrollTop(2000);

    await userEvent.click(await screen.findByRole('button', { name: 'Back to top' }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });

  it('is labelled in Vietnamese on the public site', async () => {
    setup('/works', {}, true);
    scrollTop(2000);
    expect(await screen.findByRole('button', { name: 'Lên đầu trang' })).toBeInTheDocument();
  });

  it('stays hidden on routes with their own bar', () => {
    setup('/novels/abc/2', { hideOn: [/^\/novels\/[^/]+\/[^/]+$/] });
    scrollTop(2000);
    expect(screen.queryByRole('button', { name: 'Back to top' })).not.toBeInTheDocument();
  });

  it('sits above the fixed bar on lifted routes', async () => {
    setup('/novels/abc', { liftOn: [/^\/novels\/[^/]+$/] });
    scrollTop(2000);
    expect(await screen.findByRole('button', { name: 'Back to top' })).toHaveClass('back-to-top--lifted');
  });

  it('hides while the filled video player is open and while a dialog locks the page', async () => {
    setup();
    scrollTop(2000);
    await screen.findByRole('button', { name: 'Back to top' });

    act(() => document.documentElement.classList.add('player-filled-open'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Back to top' })).not.toBeInTheDocument());
    act(() => document.documentElement.classList.remove('player-filled-open'));
    expect(await screen.findByRole('button', { name: 'Back to top' })).toBeInTheDocument();

    act(() => document.body.setAttribute('data-scroll-locked', '1'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Back to top' })).not.toBeInTheDocument());
  });
});
