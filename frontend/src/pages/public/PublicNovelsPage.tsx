import { BookOpen, PenLine, SearchX } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { EmptyState } from '../../components/EmptyState';
import { NovelsTabs, PUBLIC_NOVELS_TAB_LABELS, useNovelsTab } from '../../components/fanfics/NovelsTabs';
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

/** Files published before the field existed have no value: such a novel is a translation. */
const isOriginal = (n: PublicNovelSummary) => n.original === true;

/**
 * Public Novels home: the banner (novels picked by hand), the reader's Tủ sách in one row, then the translated novels
 * as Fanfics-style cards with search, a status filter and a sort; the Sáng tác tab lists the owner's own stories the
 * same way. Copy is Vietnamese.
 */
export default function PublicNovelsPage({ source }: { source: NovelSource }) {
  const reads = useReadCounts();
  const [novels, setNovels] = useState<PublicNovelSummary[] | null>(null);
  const [error, setError] = useState<{ title: string; hint?: string } | null>(null);
  const [tab, setTab] = useNovelsTab();
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
  const translated = useMemo(() => (novels ?? []).filter((n) => !isOriginal(n)), [novels]);
  const originals = useMemo(() => (novels ?? []).filter(isOriginal), [novels]);

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
        labels={PUBLIC_NOVELS_TAB_LABELS}
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
                <NovelListSection
                  novels={translated}
                  reads={reads}
                  headingId="all-novels-heading"
                  heading="Tất cả truyện"
                  listLabel="Danh sách truyện"
                  sortId="novels-sort"
                  empty={<EmptyState icon={BookOpen}>Chưa có truyện dịch nào. Quay lại sau nhé.</EmptyState>}
                />
              </>
            )}
          </>
        }
        originals={
          <>
            {error && <Alert title={error.title} hint={error.hint} />}
            {novels === null ? (
              <LoadingText>Đang tải…</LoadingText>
            ) : (
              <NovelListSection
                novels={originals}
                reads={reads}
                headingId="all-originals-heading"
                heading="Truyện sáng tác"
                listLabel="Danh sách truyện sáng tác"
                sortId="originals-sort"
                empty={<EmptyState icon={PenLine}>Chưa có truyện sáng tác nào. Quay lại sau nhé.</EmptyState>}
              />
            )}
          </>
        }
      />
    </Page>
  );
}

/** A heading, the search toolbar and the cards of `novels`; `empty` shows when the list itself is empty. */
function NovelListSection({
  novels,
  reads,
  headingId,
  heading,
  listLabel,
  sortId,
  empty,
}: {
  novels: PublicNovelSummary[];
  reads: Record<string, number> | null;
  headingId: string;
  heading: string;
  listLabel: string;
  sortId: string;
  empty: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<NovelStatusFilter>('all');
  const [sort, setSort] = useState<NovelSort>('updated');
  const visible = useMemo(
    () => sortNovels(filterNovels(novels, query, status), sort, reads),
    [novels, query, status, sort, reads],
  );
  if (novels.length === 0) return <>{empty}</>;
  return (
    <section className="fanfics" aria-labelledby={headingId}>
      {/* Its own heading, like Tủ sách above, so the search reads as part of this list, not the shelf. */}
      <h2 className="history__heading" id={headingId}>
        {heading}
      </h2>
      <ListToolbar
        searchLabel="Tìm truyện"
        searchPlaceholder="Tìm theo tên, tác giả, thẻ…"
        query={query}
        onQueryChange={setQuery}
        statusLabel="Trạng thái"
        statuses={STATUSES}
        status={status}
        onStatusChange={setStatus}
        sortId={sortId}
        sortLabel="Sắp xếp theo"
        sorts={SORTS}
        sort={sort}
        onSortChange={setSort}
      />
      {visible.length === 0 ? (
        <EmptyState icon={SearchX}>Không tìm thấy truyện nào.</EmptyState>
      ) : (
        <ul className="fanfic-list" aria-label={listLabel}>
          {visible.map((n) => (
            <li key={n.slug}>
              <NovelCard novel={n} href={`/novels/${n.slug}`} reads={reads?.[n.slug]} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
