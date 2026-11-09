import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import type { PageDto, RotateDirection } from '../../api/novels';
import { Tip } from '../Tip';

/**
 * One page screenshot of a draft chapter: drag handle, thumbnail (click to enlarge), rotate left/right, delete, and
 * badges for a landscape photo (orange) or a translation that may be incomplete (purple).
 */
export function PageRow({
  page,
  number,
  locked,
  onEnlarge,
  onRotate,
  onDelete,
}: {
  page: PageDto;
  number: number;
  locked: boolean;
  onEnlarge: () => void;
  onRotate: (direction: RotateDirection) => void;
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
      {(page.landscape || page.suspect) && (
        <span className="page-thumb__badges">
          {page.landscape && <span className="badge badge--done">Landscape</span>}
          {page.suspect && <span className="badge badge--progress">May be incomplete</span>}
        </span>
      )}
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
      <span className="page-thumb__bar">
        <Tip label="Rotate left">
          <button
            className="button button--icon"
            type="button"
            disabled={locked}
            onClick={() => onRotate('LEFT')}
            aria-label={`Rotate page ${number} left`}
          >
            <RotateCcw className="icon" aria-hidden="true" />
          </button>
        </Tip>
        <Tip label="Rotate right">
          <button
            className="button button--icon"
            type="button"
            disabled={locked}
            onClick={() => onRotate('RIGHT')}
            aria-label={`Rotate page ${number} right`}
          >
            <RotateCw className="icon" aria-hidden="true" />
          </button>
        </Tip>
      </span>
    </li>
  );
}
