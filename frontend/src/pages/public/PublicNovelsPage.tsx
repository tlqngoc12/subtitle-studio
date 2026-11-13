import { BookOpen, SearchX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { NovelsTabs, useNovelsTab } from '../../components/fanfics/NovelsTabs';
import { NovelCard } from '../../components/novel/NovelCard';
import type { NovelSource } from '../../data/novelSource';
import type { PublicNovelSummary } from '../../data/novelTypes';
import { errorMessage } from '../../lib/errors';
import { filterNovels, sortNovels, type NovelSort, type NovelStatusFilter } from '../../lib/novelList';
import FeaturedNovels from './FeaturedNovels';
import { useReadCounts } from '../../data/novelReads';
import { ShelfRow } from './ShelfRow';
import { readShelf } from './readerPrefs';
import { PUBLIC_ERROR_TITLE, bannerNovels, useDocumentTitle } from './publicNames';
import { Alert } from '../../components/ui/Alert';
import { ListToolbar } from '../../components/ui/ListToolbar';
import { PageHeader } from '../../components/ui/PageHeader';
import { LoadingText } from '../../components/ui/LoadingText';
import { Page } from '../../components/ui/Page';
import '../../components/fanfics/FanficsTab.css';
import './PublicNovelsPage.css';

const STATUSES: { value: NovelStatusFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'ongoing', label: 'Đang ra' },
];

const SORTS: { value: NovelSort; label: string }[] = [
  { value: 'updated', label: 'Mới cập nhật' },
  { value: 'read', label: 'Đọc nhiều nhất' },
  { value: 'added', label: 'Mới thêm' },
  { value: 'title', label: 'Tên A–Z' },
];

/**
 * Public Novels home: the banner (novels picked by hand), the reader's Tủ sách in one row, then every novel as
 * Fanfics-style cards with search, a status filter and a sort. Copy is Vietnamese.
 */
export default function PublicNovelsPage({ source }: { source: NovelSource }) {
  const reads = useReadCounts();
  const [novels, setNovels] = useState<PublicNovelSummary[] | null>(null);
  const [error, setError] = useState<{ title: string; hint?: string } | null>(null);
  const [tab, setTab] = useNovelsTab();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<NovelStatusFilter>('all');
  const [sort, setSort] = useState<NovelSort>('updated');
  useDocumentTitle('Truyện');

  useEffect(() => {
    source
      .listNovels()
      .then(setNovels)
      .catch((e) => {
        setNovels([]);
        setError({ title: PUBLIC_ERROR_TITLE, hint: errorMessage(e, { readOnly: true }).hint });
      });
  }, [source]);

  const featured = useMemo(() => (novels === null ? [] : bannerNovels(novels)), [novels]);
  const visible = useMemo(
    () => sortNovels(filterNovels(novels ?? [], query, status), sort, reads),
    [novels, query, status, sort, reads],
  );

  const shelved = useMemo(() => {
    if (novels === null) return [];
    const bySlug = new Map(novels.map((n) => [n.slug, n]));
    return readShelf().flatMap((slug) => bySlug.get(slug) ?? []);
  }, [novels]);

  return (
    <Page>
      <PageHeader title="Truyện" />
      <NovelsTabs
        tab={tab}
        onTabChange={setTab}
        labels={{ translated: 'Truyện dịch', fanfics: 'Fanfic' }}
        translated={
          <>
            {error && <Alert title={error.title} hint={error.hint} />}
            {novels === null ? (
              <LoadingText>Đang tải…</LoadingText>
            ) : novels.length === 0 ? (
              <EmptyState icon={BookOpen}>Chưa có truyện nào. Quay lại sau nhé.</EmptyState>
            ) : (
              <>
                <FeaturedNovels novels={featured} source={source} />
                <ShelfRow novels={shelved} />
                <section className="fanfics" aria-label="Truyện dịch">
                  <ListToolbar
                    searchLabel="Tìm truyện"
                    searchPlaceholder="Tìm theo tên, tác giả, thẻ…"
                    query={query}
                    onQueryChange={setQuery}
                    statusLabel="Trạng thái"
                    statuses={STATUSES}
                    status={status}
                    onStatusChange={setStatus}
                    sortId="novels-sort"
                    sortLabel="Sắp xếp theo"
                    sorts={SORTS}
                    sort={sort}
                    onSortChange={setSort}
                  />
                  {visible.length === 0 ? (
                    <EmptyState icon={SearchX}>Không tìm thấy truyện nào.</EmptyState>
                  ) : (
                    <ul className="fanfic-list" aria-label="Danh sách truyện">
                      {visible.map((n) => (
                        <li key={n.slug}>
                          <NovelCard novel={n} href={`/novels/${n.slug}`} reads={reads?.[n.slug]} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </>
        }
      />
    </Page>
  );
}
