import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import './SortableList.css';

/** A vertical list the user can reorder by dragging a handle (or with Space and the arrow keys). */
export function SortableList<T extends { key: number }>({
  items,
  onChange,
  children,
}: {
  items: T[];
  /** Receives the items in their new order. */
  onChange: (items: T[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.key === active.id);
    const to = items.findIndex((i) => i.key === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(items, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
        <ul className="sortable">{children}</ul>
      </SortableContext>
    </DndContext>
  );
}

/** One row of a {@link SortableList}: a drag handle named `handleLabel`, then the content. */
export function SortableItem({ id, handleLabel, children }: { id: number; handleLabel: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      className={isDragging ? 'sortable__item sortable__item--dragging' : 'sortable__item'}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="button button--icon sortable__handle"
        aria-label={handleLabel}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="icon" aria-hidden="true" />
      </button>
      <div className="sortable__content">{children}</div>
    </li>
  );
}
