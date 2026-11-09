import { BookOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { EmptyState } from '../../components/EmptyState';
import type { NovelSource } from '../../data/novelSource';
import type { PublicNovelSummary } from '../../data/novelTypes';
import { errorMessage } from '../../lib/errors';
import { NovelCard } from './NovelCard';
import { PUBLIC_ERROR_TITLE, byLatestUpdate, useDocumentTitle } from './publicNames';

/** `/novels/all`: every public novel as the small cards of the home page, newest update first. */
export default function PublicAllNovelsPage({ source }: { source: NovelSource }) {
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
    <main className="page">
      <Breadcrumbs items={[{ label: 'Novels', to: '/novels' }, { label: 'Tất cả truyện' }]} />
      <header className="masthead">
        <h1 className="masthead__name">Tất cả truyện</h1>
      </header>
      {error && (
        <div className="alert" role="alert">
          <p className="alert__title">{error.title}</p>
          {error.hint && <p className="alert__hint">{error.hint}</p>}
        </div>
      )}
      {sorted === null ? (
        <p className="muted">Đang tải…</p>
      ) : sorted.length === 0 ? (
        <EmptyState icon={BookOpen}>Chưa có truyện nào. Quay lại sau nhé.</EmptyState>
      ) : (
        <ul className="novel-grid" aria-label="Tất cả truyện">
          {sorted.map((n) => (
            <NovelCard key={n.slug} novel={n} />
          ))}
        </ul>
      )}
    </main>
  );
}
