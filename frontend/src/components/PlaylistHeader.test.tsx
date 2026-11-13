import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { SiteProvider } from '../data/SiteContext';
import { resetWatched } from '../data/watched';
import { detail, vsVideo } from '../test/playlistFixtures';
import { fakeSource, publicSite } from '../test/fakeSource';
import { PlaylistHeader } from './PlaylistHeader';

describe('PlaylistHeader on the public site', () => {
  beforeEach(() => {
    localStorage.setItem('subtitle-studio.watched', JSON.stringify(['AAA00000001']));
    resetWatched();
  });

  it('offers Xem tiếp and names the next video, with no episode number', () => {
    const playlist = detail(1, 'MV', [vsVideo('AAA00000001', 'Bài một'), vsVideo('BBB00000001', 'Bài hai')]);
    render(
      <SiteProvider value={publicSite(fakeSource({}))}>
        <MemoryRouter>
          <PlaylistHeader playlist={playlist as never} />
        </MemoryRouter>
      </SiteProvider>,
    );
    const region = screen.getByRole('region', { name: /MV/ });

    expect(within(region).getByRole('link', { name: 'Xem tiếp' })).toHaveAttribute('href', '/vietsub/BBB00000001?playlist=1');
    expect(within(region).getByText('Tiếp theo: Bài hai')).toBeInTheDocument();
    expect(within(region).queryByText(/EP \d|tập \d/)).not.toBeInTheDocument();
  });
});
