import type { SimpleIcon } from 'simple-icons';
import { brandOf, iconFor, LinkIcon } from '../ui/LinkIcon';

/** The platform logo for a URL, or null when the host is not a known platform (or the URL is invalid). */
export function platformIcon(url: string | null): SimpleIcon | null {
  return brandOf(iconFor(url, null));
}

/** Brand logo (single-colour, follows the text colour) or a generic link icon. Decorative: the link text names it. */
export function BrandIcon({ url }: { url: string | null }) {
  return <LinkIcon iconKey={iconFor(url, null)} />;
}
