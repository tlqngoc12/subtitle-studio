import { LoaderCircle } from 'lucide-react';
import { busyLine, type NovelBusy } from '../../lib/novelBusy';
import './BusyLine.css';

/** "Chapter 25 is translating…": a muted line while a job holds the novel. */
export function BusyLine({ busy }: { busy: NovelBusy }) {
  return (
    <p className="novel-busy muted" aria-live="polite">
      <LoaderCircle className="icon icon--sm novel-busy__icon" aria-hidden="true" />
      {busyLine(busy)}
    </p>
  );
}
