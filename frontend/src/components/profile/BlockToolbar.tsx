import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';

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
    { label: 'Sửa khối', icon: Pencil, onClick: onEdit, off: false },
    { label: 'Di chuyển khối lên', icon: ArrowUp, onClick: () => onMove('UP'), off: first },
    { label: 'Di chuyển khối xuống', icon: ArrowDown, onClick: () => onMove('DOWN'), off: last },
    { label: 'Xóa khối', icon: Trash2, onClick: onDelete, off: false },
  ];
  return (
    <div className="ptools">
      {tools.map(({ label, icon: Icon, onClick, off }) => (
        <button
          key={label}
          type="button"
          className="button button--icon"
          aria-label={label}
          title={label}
          disabled={disabled || off}
          onClick={onClick}
        >
          <Icon className="icon" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
