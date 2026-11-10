import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollToTop } from './ScrollToTop';

function Page({ name }: { name: string }) {
  const navigate = useNavigate();
  return (
    <div>
      <h1>{name}</h1>
      <Link to="/b">to b</Link>
      <Link to="/a?tab=2">same page, other tab</Link>
      <Link to="/a#section">same page, hash</Link>
      <Link to="/b#section">other page, hash</Link>
      <button onClick={() => navigate('/b', { replace: true })}>replace b</button>
      <button onClick={() => navigate(-1)}>back</button>
    </div>
  );
}

function renderAt(entry: string, entries: string[] = [entry]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.indexOf(entry)}>
      <ScrollToTop />
      <Routes>
        <Route path="/a" element={<Page name="A" />} />
        <Route path="/b" element={<Page name="B" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ScrollToTop', () => {
  const scrollTo = vi.fn();

  beforeEach(() => {
    scrollTo.mockClear();
    vi.stubGlobal('scrollTo', scrollTo);
  });

  it('does not scroll when the app first opens', () => {
    renderAt('/a');

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls to the top when a link opens another page (PUSH)', async () => {
    renderAt('/a');

    await userEvent.setup().click(screen.getByRole('link', { name: 'to b' }));

    expect(await screen.findByRole('heading', { name: 'B' })).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('scrolls to the top on a REPLACE to another page too', async () => {
    renderAt('/a');

    await userEvent.setup().click(screen.getByRole('button', { name: 'replace b' }));

    expect(await screen.findByRole('heading', { name: 'B' })).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('does not scroll on Back or Forward (POP): the browser restores the position', async () => {
    renderAt('/b', ['/a', '/b']);

    await userEvent.setup().click(screen.getByRole('button', { name: 'back' }));

    expect(await screen.findByRole('heading', { name: 'A' })).toBeInTheDocument();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does not scroll when only the query changes (?tab=, ?q=, ?page=)', async () => {
    renderAt('/a');

    await userEvent.setup().click(screen.getByRole('link', { name: 'same page, other tab' }));

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does not scroll for a #hash link, on the same page or another', async () => {
    renderAt('/a');
    const user = userEvent.setup();

    await user.click(screen.getByRole('link', { name: 'same page, hash' }));
    await user.click(screen.getByRole('link', { name: 'other page, hash' }));

    expect(await screen.findByRole('heading', { name: 'B' })).toBeInTheDocument();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
