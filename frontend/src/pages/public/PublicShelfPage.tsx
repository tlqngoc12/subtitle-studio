import { Library } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/EmptyState';
import { NovelCard } from '../../components/novel/NovelCard';
import { LoadingText } from '../../components/ui/LoadingText';
import { Page } from '../../components/ui/Page';
import { PageHeader } from '../../components/ui/PageHeader';
import { useReadCounts } from '../../data/novelReads';
import type { NovelSource } from '../../data/novelSource';
import type { PublicNovelSummary } from '../../data/novelTypes';
import { errorMessage } from '../../lib/errors';
import { PUBLIC_ERROR_TITLE, useDocumentTitle } from './publicNames';
import { readShelf } from './readerPrefs';

/** `/novels/shelf`: every novel the reader saved to Tủ sách, in shelf order, as the same cards as the list. */
export default function PublicShelfPage({ source }: { source: NovelSource }) {
  const reads = useReadCounts();
  const [novels, setNovels] = useState<PublicNovelSummary[] | null>(null);
  const [error, setError] = useState<{ title: string; hint?: string } | null>(null);
  useDocumentTitle('Tủ sách');

  useEffect(() => {
    source
      .listNovels()
      .then(setNovels)
      .catch((e) => {
        setNovels([]);
        setError({ title: PUBLIC_ERROR_TITLE, hint: errorMessage(e, { readOnly: true }).hint });
      });
  }, [source]);

  const shelved = useMemo(() => {
    if (novels === null) return null;
    const bySlug = new Map(novels.map((n) => [n.slug, n]));
    return readShelf().flatMap((slug) => bySlug.get(slug) ?? []);
  }, [novels]);

  return (
    <Page>
      <PageHeader breadcrumbs={[{ label: 'Novels', to: '/novels' }, { label: 'Tủ sách' }]} title="Tủ sách" />
      {error && <Alert title={error.title} hint={error.hint} />}
      {shelved === null ? (
        <LoadingText>Đang tải…</LoadingText>
      ) : shelved.length === 0 ? (
        !error && <EmptyState icon={Library}>Chưa có truyện nào trong tủ sách.</EmptyState>
      ) : (
        <ul className="fanfic-list" aria-label="Tủ sách">
          {shelved.map((n) => (
            <li key={n.slug}>
              <NovelCard novel={n} href={`/novels/${n.slug}`} reads={reads?.[n.slug]} />
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
