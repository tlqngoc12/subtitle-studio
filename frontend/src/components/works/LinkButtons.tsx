import { ExternalLink } from 'lucide-react';
import type { WorkLink } from '../../api/works';
import { iconFor, LinkIcon } from '../ui/LinkIcon';
import './LinkButtons.css';

/** A row of external link buttons: logo, label and an external-link glyph; each opens in a new tab. */
export function LinkButtons({ links }: { links: WorkLink[] }) {
  if (links.length === 0) return null;
  return (
    <ul className="wlinks" aria-label="Links">
      {links.map((l, i) => (
        <li key={i}>
          <a className="button button--s wlinks__link" href={l.url} target="_blank" rel="noopener noreferrer">
            <LinkIcon iconKey={iconFor(l.url, l.icon)} />
            {l.label}
            <ExternalLink className="icon wlinks__external" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}
