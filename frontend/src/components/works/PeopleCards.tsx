import type { WorkCredit } from '../../api/works';
import './PeopleCards.css';

/** Cast / artist cards: round avatar (or the initial), name, role chip and `as {character}` when set. */
export function PeopleCards({ credits }: { credits: WorkCredit[] }) {
  if (credits.length === 0) return null;
  return (
    <ul className="pcards">
      {credits.map((c) => (
        <li key={c.person.id} className="pcard">
          {c.person.avatarUrl ? (
            <img className="pcard__avatar" src={c.person.avatarUrl} alt="" loading="lazy" />
          ) : (
            <span className="pcard__avatar pcard__avatar--initial" aria-hidden="true">
              {c.person.name.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <span className="pcard__name">{c.person.name}</span>
          {c.role && <span className="pcard__role">{c.role}</span>}
          {c.characterName && <span className="pcard__character">as {c.characterName}</span>}
        </li>
      ))}
    </ul>
  );
}
