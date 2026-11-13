import type { ReactNode } from 'react';
import type { PhotoPost, PhotoSource } from '../../api/photos';
import { formatDay } from '../../lib/dates';
import { iconFor, LinkIcon } from '../ui/LinkIcon';
import { Reveal } from '../ui/Reveal';
import { tileShape } from './tileShape';
import './PhotoTile.css';
import { useT } from '../../lib/i18n';

/** Source names stay in English on both sites. */
const SOURCE_LABEL: Record<PhotoSource, string> = {
  OFFICIAL: 'Official',
  MEDIA: 'Media',
  FAN: 'Fan',
};

/**
 * One bento tile: the whole tile links to the Instagram or X post in a new tab. `children` (the admin menu) is drawn
 * beside the link, not inside it. Renders the grid item (<li>), so the menu button is never a link descendant.
 */
export function PhotoTile({ post, index, children }: { post: PhotoPost; index?: number; children?: ReactNode }) {
  const t = useT();
  const shape = tileShape(post.width, post.height);
  return (
    <Reveal as="li" className={`photo-cell photo-cell--${shape}`} delayIndex={index} layout>
      <a
        className={`photo-tile photo-tile--${shape}`}
        href={post.postUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={post.title}
      >
        <img src={post.imageUrl} alt="" loading="lazy" />
        <span className="photo-tile__chips">
          <span className="photo-tile__chip">
            <LinkIcon iconKey={iconFor(post.postUrl, null)} className="icon photo-tile__platform" />
            {SOURCE_LABEL[post.source]}
          </span>
          {post.photoCount != null && (
            <span className="photo-tile__chip">{post.photoCount === 1 ? t('1 photo', '1 ảnh') : t(`${post.photoCount} photos`, `${post.photoCount} ảnh`)}</span>
          )}
        </span>
        <span className="photo-tile__caption">
          <span className="photo-tile__title">{post.title}</span>
          <span className="photo-tile__date">{formatDay(post.takenOn)}</span>
        </span>
      </a>
      {children}
    </Reveal>
  );
}
