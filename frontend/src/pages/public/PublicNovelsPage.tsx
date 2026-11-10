import { BookOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '../../components/EmptyState';
import type { NovelSource } from '../../data/novelSource';
import type { PublicNovelSummary } from '../../data/novelTypes';
import { errorMessage } from '../../lib/errors';
import FeaturedNovels from './FeaturedNovels';
import { useReadCounts } from '../../data/novelReads';
import { NovelRow } from './NovelRow';
import { readProgress, readShelf } from './readerPrefs';
import { PUBLIC_ERROR_TITLE, byLatestUpdate, useDocumentTitle } from './publicNames';
import { Alert } from '../../components/ui/Alert';
import { LoadingText } from '../../components/ui/LoadingText';
import './PublicNovelsPage.css';

const FEATURED = 5;
const LATEST = 6;

/**
 * Public Novels home: a featured banner, then the latest updates as list rows (and a link to all of them).
 * Both are ordered by the latest published chapter, newest first. Copy is Vietnamese.
 */
export default function PublicNovelsPage({ source }: { source: NovelSource }) {
  const reads = useReadCounts();
  const [novels, setNovels] = useState<PublicNovelSummary[] | null>(null);
  const [error, setError] = useState<{ title: string; hint?: string } | null>(null);
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

  const sorted = useMemo(() => (novels === null ? null : byLatestUpdate(novels)), [novels]);
  const featured = useMemo(() => sorted?.slice(0, FEATURED) ?? [], [sorted]);

  const shelved = useMemo(() => {
    if (novels === null) return [];
    const bySlug = new Map(novels.map((n) => [n.slug, n]));
    return readShelf().flatMap((slug) => bySlug.get(slug) ?? []);
  }, [novels]);

  return (
    <main className="page">
      <h1 className="visually-hidden">Truyện</h1>
      {error && (
        <Alert title={error.title} hint={error.hint} />
      )}
      {sorted === null ? (
        <LoadingText>Đang tải…</LoadingText>
      ) : sorted.length === 0 ? (
        <EmptyState icon={BookOpen}>Chưa có truyện nào. Quay lại sau nhé.</EmptyState>
      ) : (
        <>
          <FeaturedNovels novels={featured} source={source} />
          {shelved.length > 0 && (
            <section className="history" aria-labelledby="shelf-heading">
              <h2 className="history__heading" id="shelf-heading">
                Tủ sách
              </h2>
              <ul className="novel-rows">
                {shelved.map((n) => (
                  <NovelRow key={n.slug} novel={n} continueNo={readProgress(n.slug)} reads={reads?.[n.slug]} />
                ))}
              </ul>
            </section>
          )}
          <section className="history" aria-labelledby="latest-heading">
            <div className="section-head">
              <h2 className="history__heading" id="latest-heading">
                Mới cập nhật
              </h2>
              <Link to="/novels/all">Xem tất cả</Link>
            </div>
            <ul className="novel-rows">
              {sorted.slice(0, LATEST).map((n) => (
                <NovelRow key={n.slug} novel={n} reads={reads?.[n.slug]} />
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
