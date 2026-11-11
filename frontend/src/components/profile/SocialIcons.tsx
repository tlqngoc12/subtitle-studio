import type { ProfileBlock } from '../../api/profiles';
import { Tip } from '../Tip';
import { BrandIcon } from './BrandIcon';

/** One icon link per item of every LINKS block, in block order; the accessible name is the item's label. */
export function SocialIcons({ blocks }: { blocks: ProfileBlock[] }) {
  const items = blocks.filter((b) => b.type === 'LINKS').flatMap((b) => b.items);
  if (items.length === 0) return null;
  return (
    <ul className="social" aria-label="Social links">
      {items.map((it, i) => (
        <li key={i}>
          <Tip label={it.label ?? it.value ?? ''}>
            <a
              className="social__link"
              href={it.value ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={it.label ?? it.value ?? undefined}
            >
              <BrandIcon url={it.value} />
            </a>
          </Tip>
        </li>
      ))}
    </ul>
  );
}
