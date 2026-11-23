import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { chapterDetail } from '../../test/novelFixtures';
import { ChapterNav } from './ChapterNav';

function renderNav(starting: boolean) {
  render(
    <MemoryRouter>
      <ChapterNav
        chapter={chapterDetail({ sourceType: 'ORIGINAL', nextChapterId: null })}
        chapterPath={(id) => `/c/${id}`}
        onLeave={vi.fn()}
        why={null}
        locked={false}
        starting={starting}
        onStartNext={vi.fn()}
        onAddNext={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe('ChapterNav', () => {
  it('offers Add chapter on the last chapter of an original novel', () => {
    renderNav(false);

    expect(screen.getByRole('button', { name: 'Add chapter' })).toBeEnabled();
  });

  it('says Adding… while the chapter is being added', () => {
    renderNav(true);

    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
  });
});
