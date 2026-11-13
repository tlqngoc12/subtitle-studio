import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SiteProvider } from '../../data/SiteContext';
import { fakeSource, publicSite } from '../../test/fakeSource';
import { novelSummary } from '../../test/novelFixtures';
import { NovelCard } from './NovelCard';

const BASE = novelSummary({
  description: 'Một câu chuyện dài.',
  lastPublishedAt: '2026-11-10T03:00:00Z',
  chapterCount: 12,
  publishedCount: 8,
});

function renderCard(ui: React.ReactElement, readOnly = false) {
  return render(
    <MemoryRouter>
      {readOnly ? <SiteProvider value={publicSite(fakeSource({}))}>{ui}</SiteProvider> : ui}
    </MemoryRouter>,
  );
}

describe('NovelCard (admin)', () => {
  it('links to the novel and shows status, stats and description', () => {
    renderCard(<NovelCard admin novel={BASE} href="/novels/3" reads={1500} />);

    const link = screen.getByRole('link', { name: /Tình Yêu Mùa Hạ/ });
    expect(link).toHaveAttribute('href', '/novels/3');
    expect(within(link).getByText('Ongoing')).toBeInTheDocument();
    for (const label of ['Chapters', 'Published', 'Reads', 'Updated']) {
      expect(within(link).getByText(label)).toBeInTheDocument();
    }
    expect(within(link).getByText('12')).toBeInTheDocument();
    expect(within(link).getByText('1.5K')).toBeInTheDocument();
    expect(within(link).getByText('10/11/2026')).toBeInTheDocument();
    expect(within(link).getByText('Một câu chuyện dài.')).toBeInTheDocument();
  });

  it('shows a dash for unknown reads and no banner badge when not picked', () => {
    renderCard(<NovelCard admin novel={BASE} href="/novels/3" />);

    expect(screen.getByText('–')).toBeInTheDocument();
    expect(screen.queryByText('On banner')).not.toBeInTheDocument();
  });

  it('shows the On banner badge when picked, and a hint when nothing is published', () => {
    renderCard(<NovelCard admin novel={{ ...BASE, featured: true, publishedCount: 0 }} href="/novels/3" />);

    expect(screen.getByText('On banner')).toBeInTheDocument();
    expect(screen.getByText('Not on the site until a chapter is published')).toBeInTheDocument();
  });

  it('shows no hint for a picked novel that has a published chapter', () => {
    renderCard(<NovelCard admin novel={{ ...BASE, featured: true }} href="/novels/3" />);

    expect(screen.queryByText(/Not on the site/)).not.toBeInTheDocument();
  });

  it('puts the menu outside the link', () => {
    renderCard(<NovelCard admin novel={BASE} href="/novels/3" menu={<button type="button">Menu</button>} />);

    expect(screen.getByRole('link', { name: /Tình Yêu Mùa Hạ/ })).not.toContainElement(
      screen.getByRole('button', { name: 'Menu' }),
    );
  });
});

describe('NovelCard (public)', () => {
  it('uses Vietnamese labels, no admin badge and x/y chapters', () => {
    renderCard(
      <NovelCard
        novel={{ ...BASE, featured: true, chapterCount: undefined, totalChapters: 12 }}
        href="/novels/summer-love"
        reads={20}
      />,
      true,
    );

    const link = screen.getByRole('link', { name: /Tình Yêu Mùa Hạ/ });
    expect(within(link).getByText('Đang ra')).toBeInTheDocument();
    for (const label of ['Chương', 'Lượt đọc', 'Cập nhật']) {
      expect(within(link).getByText(label)).toBeInTheDocument();
    }
    expect(within(link).getByText('8/12')).toBeInTheDocument();
    expect(screen.queryByText('Published')).not.toBeInTheDocument();
    expect(screen.queryByText('On banner')).not.toBeInTheDocument();
  });
});
