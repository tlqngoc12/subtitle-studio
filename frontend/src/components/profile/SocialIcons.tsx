import type { ProfileBlock } from '../../api/profiles';
import { Tip } from '../Tip';
import { BrandIcon } from './BrandIcon';
import { useT } from '../../lib/i18n';

/** One icon link per item of every LINKS block, in block order; the accessible name is the item's label. */
export function SocialIcons({ blocks }: { blocks: ProfileBlock[] }) {
  const t = useT();
  const items = blocks.filter((b) => b.type === 'LINKS').flatMap((b) => b.items);
  if (items.length === 0) return null;
  return (
    <ul className="social" aria-label={t('Social links', 'Liên kết mạng xã hội')}>
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
