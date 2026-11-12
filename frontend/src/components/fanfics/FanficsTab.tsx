import { BookHeart, Plus, RefreshCw, SearchX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  deleteFanfic,
  refreshAllFanfics,
  refreshFanfic,
  type Fanfic,
  type RefreshAllResult,
} from '../../api/fanfics';
import { useSite } from '../../data/SiteContext';
import { errorMessage, type ErrorMessage } from '../../lib/errors';
import { formatInstant } from '../../lib/dates';
import { normalizeForSearch } from '../../lib/search';
import { EmptyState } from '../EmptyState';
import { useConfirmDialog } from '../useConfirmDialog';
import { Alert } from '../ui/Alert';
import { Reveal } from '../ui/Reveal';
import { SearchBar } from '../ui/SearchBar';
import { FilterPills } from '../ui/FilterPills';
import { Select } from '../ui/Select';
import { Skeleton } from '../ui/Skeleton';
import { useDelayedFlag } from '../../lib/useDelayedFlag';
import { AddFanficDialog } from './AddFanficDialog';
import { FanficCard } from './FanficCard';
import { FanficMenu } from './FanficMenu';
import './FanficsTab.css';
import { useT, type Translate } from '../../lib/i18n';

type Status = 'all' | 'completed' | 'ongoing';
type Sort = 'updated' | 'read' | 'voted' | 'added';

const statuses = (t: Translate): { value: Status; label: string }[] => [
  { value: 'all', label: t('All', 'Tất cả') },
  { value: 'completed', label: t('Completed', 'Hoàn thành') },
  { value: 'ongoing', label: t('Ongoing', 'Đang ra') },
];

const sorts = (t: Translate): { value: Sort; label: string }[] => [
  { value: 'updated', label: t('Newest update', 'Mới cập nhật') },
  { value: 'read', label: t('Most read', 'Đọc nhiều nhất') },
  { value: 'voted', label: t('Most voted', 'Bình chọn nhiều nhất') },
  { value: 'added', label: t('Recently added', 'Mới thêm') },
];

const time = (iso: string | null) => (iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY);

const COMPARE: Record<Sort, (a: Fanfic, b: Fanfic) => number> = {
  updated: (a, b) => time(b.storyUpdatedAt) - time(a.storyUpdatedAt) || b.id - a.id,
  read: (a, b) => b.readCount - a.readCount || b.id - a.id,
  voted: (a, b) => b.voteCount - a.voteCount || b.id - a.id,
  added: (a, b) => time(b.createdAt) - time(a.createdAt) || b.id - a.id,
};

function matches(f: Fanfic, query: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return [f.title, f.author ?? '', f.tags.join(' ')].some((text) => normalizeForSearch(text).includes(q));
}

function FanficSkeletons() {
  const t = useT();
  const show = useDelayedFlag(true);
  if (!show) return null;
  return (
    <div className="fanfic-list" role="status" aria-busy="true" aria-label={t('Loading', 'Đang tải')}>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height="204px" radius="var(--radius-frame)" />
      ))}
    </div>
  );
}

/**
 * The Fanfics tab of Novels: Wattpad stories as cards with search, a status filter and a sort. In the admin app it
 * also adds, refreshes and deletes stories; on the public site (read-only) it only lists them.
 */
export function FanficsTab() {
  const { source, readOnly } = useSite();
  const t = useT();
  const [fanfics, setFanfics] = useState<Fanfic[] | null>(null);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [actionError, setActionError] = useState<ErrorMessage | null>(null);
  const [failures, setFailures] = useState<RefreshAllResult['failed']>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [sort, setSort] = useState<Sort>('updated');
  const [adding, setAdding] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  useEffect(() => {
    let current = true;
    source
      .listFanfics()
      .then((list) => current && setFanfics(list))
      .catch((e) => {
        if (!current) return;
        setFanfics([]);
        setError(errorMessage(e, { readOnly }));
      });
    return () => {
      current = false;
    };
  }, [source, readOnly]);

  const visible = useMemo(
    () =>
      (fanfics ?? [])
        .filter((f) => (status === 'all' ? true : status === 'completed' ? f.completed : !f.completed))
        .filter((f) => matches(f, query))
        .sort(COMPARE[sort]),
    [fanfics, query, status, sort],
  );

  const latestFetch = useMemo(() => {
    const times = (fanfics ?? []).map((f) => Date.parse(f.fetchedAt)).filter(Number.isFinite);
    return times.length ? formatInstant(new Date(Math.max(...times)).toISOString()) : null;
  }, [fanfics]);

  const replace = (updated: Fanfic) => setFanfics((all) => (all ?? []).map((f) => (f.id === updated.id ? updated : f)));

  async function refreshOne(f: Fanfic) {
    setBusyId(f.id);
    setActionError(null);
    try {
      replace(await refreshFanfic(f.id));
      toast.success('Story refreshed');
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function refreshAll() {
    setRefreshingAll(true);
    setActionError(null);
    setFailures([]);
    try {
      const result = await refreshAllFanfics();
      const text = `Updated ${result.updated} · Failed ${result.failed.length}`;
      if (result.failed.length === 0) toast.success(text);
      else toast.message(text);
      setFailures(result.failed);
      setFanfics(await source.listFanfics());
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setRefreshingAll(false);
    }
  }

  async function remove(f: Fanfic) {
    const ok = await confirm({ title: `Delete “${f.title}”?`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    setActionError(null);
    try {
      await deleteFanfic(f.id);
      setFanfics((all) => (all ?? []).filter((x) => x.id !== f.id));
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  return (
    <section className="fanfics" aria-label="Fanfics">
      {confirmDialog}
      <div className="fanfics__toolbar">
        <div className="fanfics__search">
          <SearchBar value={query} onChange={setQuery} label={t('Search fanfics', 'Tìm fanfic')} onClear={() => setQuery('')} />
        </div>
        <FilterPills label={t('Status', 'Trạng thái')} options={statuses(t)} value={status} onChange={setStatus} />
        <div className="fanfics__sort">
          <label className="visually-hidden" htmlFor="fanfics-sort">
            {t('Sort by', 'Sắp xếp theo')}
          </label>
          <Select id="fanfics-sort" value={sort} onChange={(v) => setSort(v as Sort)} options={sorts(t)} />
        </div>
        {!readOnly && (
          <div className="fanfics__actions">
            <button type="button" className="button" disabled={refreshingAll} onClick={() => void refreshAll()}>
              <RefreshCw className="icon" aria-hidden="true" />
              {refreshingAll ? 'Refreshing…' : 'Refresh all'}
            </button>
            <button type="button" className="button button--primary" onClick={() => setAdding(true)}>
              <Plus className="icon" aria-hidden="true" />
              Add fanfic
            </button>
          </div>
        )}
      </div>

      {error && <Alert title={error.title} hint={error.hint} />}
      {actionError && <Alert title={actionError.title} hint={actionError.hint} />}
      {failures.length > 0 && (
        <Alert title={`Could not refresh ${failures.length} ${failures.length === 1 ? 'story' : 'stories'}`}>
          <ul className="fanfics__failures">
            {failures.map((f) => (
              <li key={f.id}>
                <strong>{f.title}</strong>: {f.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {fanfics === null && !error && <FanficSkeletons />}

      {fanfics !== null && fanfics.length === 0 && !error && (
        <EmptyState icon={BookHeart}>
          {t('No fanfics yet.', 'Chưa có fanfic nào.')}
          {!readOnly && ' Choose Add fanfic and paste a Wattpad story link.'}
        </EmptyState>
      )}

      {fanfics !== null && fanfics.length > 0 && visible.length === 0 && (
        <EmptyState icon={SearchX}>{t('No fanfics match your search.', 'Không có fanfic nào khớp với tìm kiếm.')}</EmptyState>
      )}

      {visible.length > 0 && (
        <ul className="fanfic-list" aria-label={t('Fanfic list', 'Danh sách fanfic')}>
          {visible.map((f, i) => (
            <Reveal as="li" key={f.id} delayIndex={i} layout>
              <FanficCard
                fanfic={f}
                menu={
                  readOnly ? undefined : (
                    <FanficMenu
                      title={f.title}
                      busy={busyId === f.id}
                      onRefresh={() => void refreshOne(f)}
                      onDelete={() => void remove(f)}
                    />
                  )
                }
              />
            </Reveal>
          ))}
        </ul>
      )}

      {latestFetch && (
        <p className="fanfics__note">
          {t(`Stats from Wattpad, updated ${latestFetch} · Stories © their authors`, `Số liệu từ Wattpad, cập nhật ${latestFetch} · Truyện thuộc bản quyền tác giả`)}
        </p>
      )}

      {!readOnly && (
        <AddFanficDialog
          open={adding}
          onOpenChange={setAdding}
          onSaved={(saved) => {
            setFanfics((all) => [saved, ...(all ?? []).filter((f) => f.id !== saved.id)]);
            setAdding(false);
            toast.success('Fanfic added');
          }}
        />
      )}
    </section>
  );
}
