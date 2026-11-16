import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { RotateCcw, RotateCw, TriangleAlert } from 'lucide-react';
import type { PageDto, RotateDirection } from '../../api/novels';
import { PageRow } from '../novel/PageRow';
import { PageUploader } from '../novel/PageUploader';

interface SectionProps {
  pages: PageDto[];
  /** Id of the heading (the section is labelled by it). */
  headingId: string;
  translating: boolean;
  locked: boolean;
  uploading: boolean;
  onFiles: (files: File[]) => void;
  onRotateAll: (direction: RotateDirection) => void;
  onRotate: (page: PageDto, direction: RotateDirection) => void;
  onDelete: (page: PageDto, number: number) => void;
  onReorder: (next: PageDto[]) => void;
  onEnlarge: (index: number) => void;
}

/** A draft screenshot chapter's pages: upload, rotate all, and the sortable grid. */
export function ChapterPagesSection({
  pages, headingId, translating, locked, uploading, onFiles, onRotateAll, onRotate, onDelete, onReorder, onEnlarge,
}: SectionProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = pages.findIndex((p) => p.id === active.id);
    const to = pages.findIndex((p) => p.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(pages, from, to));
  }

  return (
    <section className="chapter-pages" aria-labelledby={headingId}>
      <h2 id={headingId} className="history__heading">Pages</h2>
      <PageUploader disabled={translating} busy={uploading} onFiles={onFiles} />
      {pages.length > 0 && (
        <div className="chapter-pages__rotate">
          <button className="button button--s" type="button" disabled={locked} onClick={() => onRotateAll('LEFT')}>
            <RotateCcw className="icon" aria-hidden="true" />
            Rotate all left
          </button>
          <button className="button button--s" type="button" disabled={locked} onClick={() => onRotateAll('RIGHT')}>
            <RotateCw className="icon" aria-hidden="true" />
            Rotate all right
          </button>
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
          <ol className="page-grid" aria-label="Pages">
            {pages.map((p, i) => (
              <PageRow
                key={p.id}
                page={p}
                number={i + 1}
                locked={locked}
                onEnlarge={() => onEnlarge(i)}
                onRotate={(d) => onRotate(p, d)}
                onDelete={() => onDelete(p, i + 1)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </section>
  );
}

/** "Pages 2, 5 may be incomplete": each number opens that page enlarged. */
export function SuspectPagesWarning({ numbers, onShow }: { numbers: number[]; onShow: (index: number) => void }) {
  if (numbers.length === 0) return null;
  return (
    <p className="chapter-warning">
      <TriangleAlert className="icon" aria-hidden="true" />
      {numbers.length === 1 ? 'Page ' : 'Pages '}
      {numbers.map((n, i) => (
        <span key={n}>
          <button className="chapter-warning__page" type="button" aria-label={`Show page ${n}`}
            onClick={() => onShow(n - 1)}>
            {n}
          </button>
          {i < numbers.length - 1 ? ', ' : ''}
        </span>
      ))}
      {' may be incomplete'}
    </p>
  );
}
