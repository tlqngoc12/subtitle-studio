import { BookOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../components/EmptyState';
import type { NovelSource } from '../../data/novelSource';
import type { PublicNovelSummary } from '../../data/novelTypes';
import { errorMessage } from '../../lib/errors';
import { useReadCounts } from '../../data/novelReads';
import { NovelTile } from './NovelTile';
import { PUBLIC_ERROR_TITLE, byLatestUpdate, useDocumentTitle } from './publicNames';
import { Alert } from '../../components/ui/Alert';
import { LoadingText } from '../../components/ui/LoadingText';
import { Page } from '../../components/ui/Page';
import { PageHeader } from '../../components/ui/PageHeader';

/** `/novels/all`: every public novel as large-cover tiles, newest update first. */
export default function PublicAllNovelsPage({ source }: { source: NovelSource }) {
  const reads = useReadCounts();
  const [novels, setNovels] = useState<PublicNovelSummary[] | null>(null);
  const [error, setError] = useState<{ title: string; hint?: string } | null>(null);
  useDocumentTitle('Tất cả truyện');

  useEffect(() => {
    source
      .listNovels()
      .then(setNovels)
      .catch((e) => {
        setNovels([]);
        setError({ title: PUBLIC_ERROR_TITLE, hint: errorMessage(e, { readOnly: true }).hint });
      });
  }, [source]);

  const sorted = useMemo(() => (novels === null ? null : byLatestUpdate(novels)), [novels]);

  return (
    <Page>
      <PageHeader breadcrumbs={[{ label: 'Novels', to: '/novels' }, { label: 'Tất cả truyện' }]} title="Tất cả truyện" />
      {error && (
        <Alert title={error.title} hint={error.hint} />
      )}
      {sorted === null ? (
        <LoadingText>Đang tải…</LoadingText>
      ) : sorted.length === 0 ? (
        <EmptyState icon={BookOpen}>Chưa có truyện nào. Quay lại sau nhé.</EmptyState>
      ) : (
        <ul className="novel-tiles" aria-label="Tất cả truyện">
          {sorted.map((n) => (
            <NovelTile key={n.slug} novel={n} reads={reads?.[n.slug]} />
          ))}
        </ul>
      )}
    </Page>
  );
}
