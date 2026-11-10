import { CircleCheck, PencilLine } from 'lucide-react';
import type { EditStatus } from '../api/client';
import { Tip } from './Tip';
import './EditStatusIcon.css';

/**
 * The edit status of a Vietsub as a small icon next to its AI/Manual label: purple pencil = in progress,
 * orange check = done. A video that was never edited (null) shows nothing.
 */
export function EditStatusIcon({ status }: { status: EditStatus | null }) {
  if (status === null) return null;
  const done = status === 'DONE';
  const label = done ? 'Done' : 'In progress';
  const Icon = done ? CircleCheck : PencilLine;
  return (
    <Tip label={label}>
      <span className={`edit-status edit-status--${done ? 'done' : 'progress'}`} role="img" aria-label={label}>
        <Icon className="icon icon--sm" aria-hidden="true" />
      </span>
    </Tip>
  );
}
