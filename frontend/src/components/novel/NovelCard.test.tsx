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
    // Admin keeps Chapters and Published as separate stats, with units.
    const units = Array.from(link.querySelectorAll('.fanfic-stat__unit')).map((u) => u.textContent?.trim());
    expect(units).toEqual(['chapters', 'published', 'reads']);
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
  it('puts a check icon on the Hoàn thành badge but not on Đang ra', () => {
    const { unmount } = renderCard(
      <NovelCard novel={{ ...BASE, novelStatus: 'COMPLETED' }} href="/novels/3" />,
      true,
    );
    expect(screen.getByText('Hoàn thành').querySelector('svg')).not.toBeNull();
    unmount();
    renderCard(<NovelCard novel={{ ...BASE, novelStatus: 'ONGOING' }} href="/novels/3" />, true);
    expect(screen.getByText('Đang ra').querySelector('svg')).toBeNull();
  });

  it('uses Vietnamese labels, no admin badge and only the published chapter count', () => {
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
    // 8 published of 12 added: the reader sees 8, never "8/12".
    const chapters = within(link).getByText('Chương').closest('.fanfic-stat') as HTMLElement;
    expect(chapters.querySelector('.fanfic-stat__value')?.textContent).toBe('8 chương');
    expect(link).not.toHaveTextContent('8/12');
    const reads = within(link).getByText('Lượt đọc').closest('.fanfic-stat') as HTMLElement;
    expect(reads.querySelector('.fanfic-stat__unit')?.textContent?.trim()).toBe('lượt đọc');
    expect(screen.queryByText('Published')).not.toBeInTheDocument();
    expect(screen.queryByText('On banner')).not.toBeInTheDocument();
  });
});
