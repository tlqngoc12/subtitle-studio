import { Link2 } from 'lucide-react';
import { siFacebook, siInstagram, siSpotify, siThreads, siTiktok, siX, siYoutube, type SimpleIcon } from 'simple-icons';

/** Hostnames (and their subdomains) mapped to the platform logo shown next to a link. */
const PLATFORMS: { hosts: string[]; icon: SimpleIcon }[] = [
  { hosts: ['instagram.com'], icon: siInstagram },
  { hosts: ['x.com', 'twitter.com'], icon: siX },
  { hosts: ['tiktok.com'], icon: siTiktok },
  { hosts: ['facebook.com', 'fb.com'], icon: siFacebook },
  { hosts: ['youtube.com', 'youtu.be'], icon: siYoutube },
  { hosts: ['spotify.com'], icon: siSpotify },
  { hosts: ['threads.net', 'threads.com'], icon: siThreads },
];

/** The platform logo for a URL, or null when the host is not a known platform (or the URL is invalid). */
export function platformIcon(url: string | null): SimpleIcon | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const match = PLATFORMS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  return match?.icon ?? null;
}

/** Brand logo (single-colour, follows the text colour) or a generic link icon. Decorative: the link text names it. */
export function BrandIcon({ url }: { url: string | null }) {
  const icon = platformIcon(url);
  if (!icon) return <Link2 className="icon" aria-hidden="true" />;
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" data-platform={icon.slug}>
      <path d={icon.path} />
    </svg>
  );
}
