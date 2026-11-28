import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, CloudCheck, FileText, GripVertical, Images, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { Tip } from '../Tip';
import type { ChapterSummary } from '../../api/novels';
import { EmptyState } from '../EmptyState';
import { formatInstantWithTime } from '../../lib/dates';
import { StatusBadges } from './StatusBadges';
import './ChapterList.css';

/** The part of the title before its first colon: "Chương 7: Bữa cơm" gives "Chương 7". */
export function chapterShortName(title: string): string {
  const colon = title.indexOf(':');
  return (colon < 0 ? title : title.slice(0, colon)).trim();
}

/** The tooltip (and accessible name) of the synced icon: the Wattpad date of the synced version, then the sync time. */
export function syncedLabel(c: Pick<ChapterSummary, 'lastSyncedAt' | 'wattpadModifiedAt'>): string | null {
  if (!c.lastSyncedAt) return null;
  const synced = `Last synced: ${formatInstantWithTime(c.lastSyncedAt)}`;
  return c.wattpadModifiedAt ? `Wattpad: ${formatInstantWithTime(c.wattpadModifiedAt)} · ${synced}` : synced;
}

/**
 * The Chapters tab: one row per chapter with its badges and page count, in reading order. Rows are dragged (handle)
 * or moved with the up/down buttons; `onReorder` gets the whole list in its new order.
 */
export function ChapterList({
  novelId,
  chapters,
  fromText = false,
  original = false,
  onReorder,
}: {
  novelId: number;
  chapters: ChapterSummary[];
  /** A Wattpad novel: chapters have original text instead of pages. */
  fromText?: boolean;
  /** An original story: chapters are written here, so there are no pages and no translation. */
  original?: boolean;
  onReorder: (next: ChapterSummary[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (chapters.length === 0) {
    return (
      <EmptyState icon={FileText}>
        {original
          ? 'No chapters yet. Choose Add chapter to write the first one.'
          : fromText
            ? 'No chapters yet. Open the Wattpad tab and import the parts you want to translate.'
            : 'No chapters yet. Choose Add chapter, then add its page screenshots.'}
      </EmptyState>
    );
  }

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= chapters.length) return;
    onReorder(arrayMove(chapters, from, to));
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    move(
      chapters.findIndex((c) => c.id === active.id),
      chapters.findIndex((c) => c.id === over.id),
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={chapters.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ul className="chapter-list" aria-label="Chapters">
          {chapters.map((c, i) => (
            <ChapterRow key={c.id} novelId={novelId} chapter={c} fromText={fromText} original={original} first={i === 0}
              last={i === chapters.length - 1}
              onUp={() => move(i, i - 1)} onDown={() => move(i, i + 1)} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function ChapterRow({
  novelId,
  chapter: c,
  fromText,
  original,
  first,
  last,
  onUp,
  onDown,
}: {
  novelId: number;
  chapter: ChapterSummary;
  fromText: boolean;
  original: boolean;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: c.id,
  });
  const name = c.title;
  const synced = original ? syncedLabel(c) : null;
  const pagesLabel = fromText && c.pageCount === 0 ? 'Wattpad text' : `${c.pageCount} ${c.pageCount === 1 ? 'page' : 'pages'}`;
  return (
    <li
      ref={setNodeRef}
      className={isDragging ? 'chapter-list__item chapter-list__item--dragging' : 'chapter-list__item'}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="chapter-list__row">
        <button ref={setActivatorNodeRef} className="button button--icon button--s" type="button"
          aria-label={`Drag to reorder: ${name}`} {...attributes} {...listeners}>
          <GripVertical className="icon" aria-hidden="true" />
        </button>
        <Link className="chapter-list__open" to={`/novels/${novelId}/chapters/${c.id}`}>
          <Tip label={name}>
            <span className="chapter-list__title">{name}</span>
          </Tip>
          <span className="chapter-list__meta">
            <StatusBadges compact translation={original ? undefined : c.translationStatus} publish={c.publishStatus} model={c.translationModel} fallback={c.translatedByFallback} />
            {synced && (
              <Tip label={synced}>
                <span className="chapter-list__synced" role="img" aria-label={synced} tabIndex={0}>
                  <CloudCheck className="icon icon--sm" aria-hidden="true" />
                </span>
              </Tip>
            )}
            {!original && (
              <Tip label={pagesLabel}>
                <span className="chapter-list__pages" role="img" aria-label={pagesLabel} tabIndex={0}>
                  <Images className="icon icon--sm" aria-hidden="true" />
                  {c.pageCount > 0 && c.pageCount}
                </span>
              </Tip>
            )}
            {c.suspectPages > 0 && (
              <Tip label={`${c.suspectPages} page(s) may be incomplete`}>
                <span className="badge badge--progress" tabIndex={0}
                  aria-label={`${c.suspectPages} page(s) may be incomplete`}>
                  <TriangleAlert className="icon icon--sm" aria-hidden="true" />
                  {c.suspectPages}
                </span>
              </Tip>
            )}
          </span>
        </Link>
        <span className="chapter-list__move">
          <Tip label="Move up">
            <button className="button button--icon button--s" type="button" disabled={first} onClick={onUp}
              aria-label={`Move up: ${name}`}>
              <ArrowUp className="icon" aria-hidden="true" />
            </button>
          </Tip>
          <Tip label="Move down">
            <button className="button button--icon button--s" type="button" disabled={last} onClick={onDown}
              aria-label={`Move down: ${name}`}>
              <ArrowDown className="icon" aria-hidden="true" />
            </button>
          </Tip>
        </span>
      </div>
      {!original && c.translationStatus === 'FAILED' && c.translationError && (
        <p className="field__error chapter-list__error">{c.translationError}</p>
      )}
    </li>
  );
}
