import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { detail, vsVideo } from '../test/playlistFixtures';
import { PlaylistHeader } from './PlaylistHeader';
import { PlaylistPanel } from './PlaylistPanel';
import { css } from '../test/css';

const LONG = 'Một tiêu đề video rất dài '.repeat(12) + 'EP.12';
const PL = detail(4, 'VLOG', [vsVideo('aaaaaaaaaaa', LONG)]);

describe('long video titles stay inside their card', () => {
  it('the .title-clamp rule wraps anywhere and clamps to 2 lines', () => {
    const rule = /\.title-clamp\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule).toMatch(/-webkit-line-clamp:\s*2/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/white-space:\s*normal/);
  });

  it('the playlist panel title uses it', () => {
    render(
      <MemoryRouter>
        <PlaylistPanel playlist={PL} index={0} autoplay ended={false} onAutoplayChange={vi.fn()} onPrevious={vi.fn()} onNext={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText(LONG)).toHaveClass('title-clamp');
  });

  it('the first-videos preview of a playlist card uses it', () => {
    render(
      <MemoryRouter>
        <PlaylistHeader playlist={PL} href="/vietsub/list?playlist=4" />
      </MemoryRouter>,
    );
    const preview = screen.getByRole('list', { name: 'First videos' });
    expect(within(preview).getByText(LONG)).toHaveClass('title-clamp');
  });
});
