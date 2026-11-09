import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, FileText, GripVertical } from 'lucide-react';
import { Link } from 'react-router';
import { Tip } from '../Tip';
import type { ChapterSummary } from '../../api/novels';
import { EmptyState } from '../EmptyState';
import { StatusBadges } from './StatusBadges';

/** The chapter's label ("Ngoại truyện 1"), or "Chapter N". */
export function chapterName(chapterNo: number, label?: string | null): string {
  return label?.trim() ? label.trim() : `Chapter ${chapterNo}`;
}

/** The name with the title: "Chapter 3: Mưa", "Ngoại truyện 1: Ngày cưới". */
export function chapterLabel(chapterNo: number, title: string | null, label?: string | null): string {
  const name = chapterName(chapterNo, label);
  return title ? `${name}: ${title}` : name;
}

/**
 * The Chapters tab: one row per chapter with its badges and page count, in reading order. Rows are dragged (handle)
 * or moved with the up/down buttons; `onReorder` gets the whole list in its new order.
 */
export function ChapterList({
  novelId,
  chapters,
  onReorder,
}: {
  novelId: number;
  chapters: ChapterSummary[];
  onReorder: (next: ChapterSummary[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (chapters.length === 0) {
    return <EmptyState icon={FileText}>No chapters yet. Choose Add chapter, then add its page screenshots.</EmptyState>;
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
            <ChapterRow key={c.id} novelId={novelId} chapter={c} first={i === 0} last={i === chapters.length - 1}
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
  first,
  last,
  onUp,
  onDown,
}: {
  novelId: number;
  chapter: ChapterSummary;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: c.id,
  });
  const name = chapterLabel(c.chapterNo, c.title, c.label);
  return (
    <li
      ref={setNodeRef}
      className={isDragging ? 'chapter-list__item chapter-list__item--dragging' : 'chapter-list__item'}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="chapter-list__row">
        <button ref={setActivatorNodeRef} className="button button--icon" type="button"
          aria-label={`Drag to reorder: ${name}`} {...attributes} {...listeners}>
          <GripVertical className="icon" aria-hidden="true" />
        </button>
        <Link className="chapter-list__open" to={`/novels/${novelId}/chapters/${c.id}`}>
          <span className="chapter-list__title">{name}</span>
          <span className="chapter-list__meta">
            <StatusBadges translation={c.translationStatus} publish={c.publishStatus} model={c.translationModel} />
            <span className="meta">
              {c.pageCount} {c.pageCount === 1 ? 'page' : 'pages'}
            </span>
            {c.suspectPages > 0 && (
              <Tip label={`${c.suspectPages} page(s) may be incomplete`}>
                <span className="badge badge--progress" tabIndex={0}
                  aria-label={`${c.suspectPages} page(s) may be incomplete`}>
                  ⚠ {c.suspectPages}
                </span>
              </Tip>
            )}
          </span>
        </Link>
        <span className="chapter-list__move">
          <Tip label="Move up">
            <button className="button button--icon" type="button" disabled={first} onClick={onUp}
              aria-label={`Move up: ${name}`}>
              <ArrowUp className="icon" aria-hidden="true" />
            </button>
          </Tip>
          <Tip label="Move down">
            <button className="button button--icon" type="button" disabled={last} onClick={onDown}
              aria-label={`Move down: ${name}`}>
              <ArrowDown className="icon" aria-hidden="true" />
            </button>
          </Tip>
        </span>
      </div>
      {c.translationStatus === 'FAILED' && c.translationError && (
        <p className="field__error chapter-list__error">{c.translationError}</p>
      )}
    </li>
  );
}
