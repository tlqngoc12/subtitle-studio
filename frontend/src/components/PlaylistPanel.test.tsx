import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { detail, vsVideo } from '../test/playlistFixtures';
import { PlaylistPanel } from './PlaylistPanel';

const A = vsVideo('aaaaaaaaaaa', 'Alpha');
const B = vsVideo('bbbbbbbbbbb', 'Bravo');
const C = vsVideo('ccccccccccc', 'Charlie');
const PL = detail(4, 'VLOG OF US', [A, B, C]);

function renderPanel(index: number, extra: Partial<Parameters<typeof PlaylistPanel>[0]> = {}) {
  const props = {
    playlist: PL,
    index,
    autoplay: true,
    ended: false,
    onAutoplayChange: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
    ...extra,
  };
  render(
    <MemoryRouter>
      <PlaylistPanel {...props} />
    </MemoryRouter>,
  );
  return props;
}

describe('PlaylistPanel', () => {
  it('shows the playlist, the position and highlights the current video', () => {
    renderPanel(1);

    const panel = screen.getByRole('complementary', { name: 'Playlist VLOG OF US' });
    expect(within(panel).getByText('2 / 3')).toBeInTheDocument();
    const items = within(panel).getAllByRole('link');
    expect(items.map((a) => a.getAttribute('href'))).toEqual([
      '/vietsub/aaaaaaaaaaa?playlist=4',
      '/vietsub/bbbbbbbbbbb?playlist=4',
      '/vietsub/ccccccccccc?playlist=4',
    ]);
    expect(items[1]).toHaveAttribute('aria-current', 'true');
    expect(items[0]).not.toHaveAttribute('aria-current');
  });

  it('disables Previous on the first video', () => {
    renderPanel(0);

    expect(screen.getByRole('button', { name: 'Previous video' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next video' })).toBeEnabled();
  });

  it('disables Next on the last video', () => {
    renderPanel(2);

    expect(screen.getByRole('button', { name: 'Next video' })).toBeDisabled();
  });

  it('calls Previous and Next', async () => {
    const props = renderPanel(1);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Previous video' }));
    await user.click(screen.getByRole('button', { name: 'Next video' }));

    expect(props.onPrevious).toHaveBeenCalledTimes(1);
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  it('reflects and toggles the Autoplay switch', async () => {
    const props = renderPanel(0, { autoplay: true });

    const toggle = screen.getByRole('switch', { name: 'Autoplay' });
    expect(toggle).toBeChecked();
    await userEvent.setup().click(toggle);

    expect(props.onAutoplayChange).toHaveBeenCalledWith(false);
  });

  it('says when the playlist has ended', () => {
    renderPanel(2, { ended: true });

    expect(screen.getByText('End of playlist')).toBeInTheDocument();
  });
});
