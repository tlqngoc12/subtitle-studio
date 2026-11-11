import type { ProfileItem } from '../../api/profiles';

/** CHIPS items as a wrapping row of neutral pills, one per label. */
export function ChipList({ items }: { items: ProfileItem[] }) {
  return (
    <ul className="chips">
      {items.map((it, i) => (
        <li key={i} className="chips__chip">
          {it.label}
        </li>
      ))}
    </ul>
  );
}
