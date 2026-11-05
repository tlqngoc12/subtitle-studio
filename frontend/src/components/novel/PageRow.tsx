import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import type { PageDto } from '../../api/novels';
import { Tip } from '../Tip';

/** One page screenshot of a draft chapter: drag handle, thumbnail (click to enlarge), delete. */
export function PageRow({
  page,
  number,
  locked,
  onEnlarge,
  onDelete,
}: {
  page: PageDto;
  number: number;
  locked: boolean;
  onEnlarge: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
    disabled: locked,
  });
  return (
    <li
      ref={setNodeRef}
      className={isDragging ? 'page-thumb page-thumb--dragging' : 'page-thumb'}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button className="page-thumb__shot" type="button" onClick={onEnlarge} aria-label={`Enlarge page ${number}`}>
        <img src={page.mediaUrl} alt="" loading="lazy" />
      </button>
      <span className="page-thumb__bar">
        <button
          ref={setActivatorNodeRef}
          className="button button--icon"
          type="button"
          aria-label={`Drag to reorder: page ${number}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="icon" aria-hidden="true" />
        </button>
        <span className="page-thumb__number">{number}</span>
        <Tip label="Delete page">
          <button
            className="button button--icon button--danger"
            type="button"
            disabled={locked}
            onClick={onDelete}
            aria-label={`Delete page ${number}`}
          >
            <Trash2 className="icon" aria-hidden="true" />
          </button>
        </Tip>
      </span>
    </li>
  );
}
