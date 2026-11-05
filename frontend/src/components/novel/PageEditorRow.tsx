import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { useId } from 'react';
import type { PageDto } from '../../api/novels';
import { Tip } from '../Tip';

/** One page: drag handle, screenshot (click to enlarge) and its translation box. */
export function PageEditorRow({
  page,
  number,
  text,
  locked,
  onText,
  onEnlarge,
  onDelete,
}: {
  page: PageDto;
  number: number;
  text: string;
  locked: boolean;
  onText: (text: string) => void;
  onEnlarge: () => void;
  onDelete: () => void;
}) {
  const id = useId();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
    disabled: locked,
  });
  return (
    <li
      ref={setNodeRef}
      className={isDragging ? 'page-row page-row--dragging' : 'page-row'}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="page-row__side">
        <span className="page-row__number">{number}</span>
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
      </div>
      <button className="page-row__shot" type="button" onClick={onEnlarge} aria-label={`Enlarge page ${number}`}>
        <img src={page.mediaUrl} alt="" loading="lazy" />
      </button>
      <div className="field page-row__text">
        <label htmlFor={id}>Page {number} translation</label>
        <textarea id={id} rows={12} value={text} disabled={locked} onChange={(e) => onText(e.target.value)} />
      </div>
    </li>
  );
}
