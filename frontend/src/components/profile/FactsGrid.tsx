import type { ProfileItem } from '../../api/profiles';

/** FACTS items as a two-column grid of `Label` / value pairs (one column on narrow screens, see MemberSection.css). */
export function FactsGrid({ items }: { items: ProfileItem[] }) {
  return (
    <dl className="facts">
      {items.map((it, i) => (
        <div className="facts__pair" key={i}>
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
