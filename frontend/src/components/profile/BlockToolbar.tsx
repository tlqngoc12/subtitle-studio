import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { Tip } from '../Tip';

/** Edit-mode tools of one block. */
export function BlockToolbar({
  first,
  last,
  disabled,
  onEdit,
  onMove,
  onDelete,
}: {
  first: boolean;
  last: boolean;
  disabled: boolean;
  onEdit: () => void;
  onMove: (direction: 'UP' | 'DOWN') => void;
  onDelete: () => void;
}) {
  const tools = [
    { label: 'Edit block', icon: Pencil, onClick: onEdit, off: false },
    { label: 'Move block up', icon: ArrowUp, onClick: () => onMove('UP'), off: first },
    { label: 'Move block down', icon: ArrowDown, onClick: () => onMove('DOWN'), off: last },
    { label: 'Delete block', icon: Trash2, onClick: onDelete, off: false },
  ];
  return (
    <div className="ptools">
      {tools.map(({ label, icon: Icon, onClick, off }) => (
        <Tip key={label} label={label}>
          <button
            type="button"
            className="button button--icon"
            aria-label={label}
            disabled={disabled || off}
            onClick={onClick}
          >
            <Icon className="icon" aria-hidden="true" />
          </button>
        </Tip>
      ))}
    </div>
  );
}
