import { Link2 } from 'lucide-react';
import {
  siApplemusic,
  siFacebook,
  siInstagram,
  siLine,
  siNetflix,
  siSpotify,
  siThreads,
  siTiktok,
  siX,
  siYoutube,
  type SimpleIcon,
} from 'simple-icons';

/** Icon keys a link may carry (`link` is the generic lucide icon). Must match the backend's WorkValidator list. */
export const ICON_KEYS = [
  'youtube',
  'x',
  'instagram',
  'tiktok',
  'facebook',
  'netflix',
  'spotify',
  'applemusic',
  'line',
  'threads',
  'link',
] as const;
export type IconKey = (typeof ICON_KEYS)[number];

const BRANDS: Record<Exclude<IconKey, 'link'>, SimpleIcon> = {
  youtube: siYoutube,
  x: siX,
  instagram: siInstagram,
  tiktok: siTiktok,
  facebook: siFacebook,
  netflix: siNetflix,
  spotify: siSpotify,
  applemusic: siApplemusic,
  line: siLine,
  threads: siThreads,
};

/** Hostnames (and their subdomains) mapped to the platform. iQIYI, WeTV and Viu have no simple-icons logo. */
const HOSTS: { hosts: string[]; key: Exclude<IconKey, 'link'> }[] = [
  { hosts: ['instagram.com'], key: 'instagram' },
  { hosts: ['x.com', 'twitter.com'], key: 'x' },
  { hosts: ['tiktok.com'], key: 'tiktok' },
  { hosts: ['facebook.com', 'fb.com'], key: 'facebook' },
  { hosts: ['youtube.com', 'youtu.be'], key: 'youtube' },
  { hosts: ['spotify.com'], key: 'spotify' },
  { hosts: ['threads.net', 'threads.com'], key: 'threads' },
  { hosts: ['netflix.com'], key: 'netflix' },
  { hosts: ['music.apple.com'], key: 'applemusic' },
  { hosts: ['line.me'], key: 'line' },
];

function isKey(key: string | null): key is IconKey {
  return key !== null && (ICON_KEYS as readonly string[]).includes(key);
}

/** The icon of a link: an explicit known key wins, else the URL's host decides, else the generic link icon. */
export function iconFor(url: string | null, key: string | null): IconKey {
  if (isKey(key)) return key;
  if (!url) return 'link';
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'link';
  }
  return HOSTS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)))?.key ?? 'link';
}

/** The simple-icons logo behind a key, or null for the generic link icon. */
export function brandOf(key: IconKey): SimpleIcon | null {
  return key === 'link' ? null : BRANDS[key];
}

/** Brand logo (single-colour, follows the text colour) or a generic link icon. Decorative: the label names the link. */
export function LinkIcon({ iconKey, className = 'icon' }: { iconKey: IconKey; className?: string }) {
  const brand = brandOf(iconKey);
  if (!brand) return <Link2 className={className} aria-hidden="true" />;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" data-platform={brand.slug}>
      <path d={brand.path} />
    </svg>
  );
}
