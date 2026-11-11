import { FileText, Image as ImageIcon, Images, Info, Link as LinkIcon, Music, Tags, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import Markdown from 'react-markdown';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import type { BlockType, ProfileBlock, ProfileItem } from '../../api/profiles';
import { Tip } from '../Tip';
import { BrandIcon } from './BrandIcon';
import { ChipList } from './ChipList';
import { FactsGrid } from './FactsGrid';
import './BlockView.css';

/** Shown before a block's title so each kind of content is recognisable at a glance. */
const TYPE_ICONS: Record<BlockType, LucideIcon> = {
  TEXT: FileText,
  IMAGE: ImageIcon,
  GALLERY: Images,
  EMBED: Music,
  LINKS: LinkIcon,
  FACTS: Info,
  CHIPS: Tags,
};

/**
 * One profile block in view mode. In a member section the block is `plain` (no card), its title is a level-3
 * heading and the first FACTS block can hide its title (`hideTitle`: it reads as the member's header facts).
 */
export function BlockView({
  block,
  plain = false,
  hideTitle = false,
}: {
  block: ProfileBlock;
  plain?: boolean;
  hideTitle?: boolean;
}) {
  const Heading = plain ? 'h3' : 'h2';
  return (
    <section className={plain ? 'pblock pblock--plain' : 'pblock'}>
      {block.title && !hideTitle && (
        <Heading className="pblock__title">
          <TitleIcon type={block.type} />
          {block.title}
        </Heading>
      )}
      <BlockBody block={block} />
    </section>
  );
}

function TitleIcon({ type }: { type: BlockType }) {
  const Icon = TYPE_ICONS[type];
  return <Icon className="pblock__title-icon" aria-hidden="true" />;
}

function BlockBody({ block }: { block: ProfileBlock }) {
  switch (block.type) {
    case 'TEXT':
      return <TextBody body={block.body ?? ''} />;
    case 'IMAGE': {
      const alt = block.caption ?? block.title ?? 'Image';
      return (
        <ImageGrid
          images={[{ src: block.mediaUrl ?? '', alt }]}
          single
          captions={block.caption ? [block.caption] : []}
        />
      );
    }
    case 'GALLERY':
      return (
        <ImageGrid
          images={block.items.map((it, i) => ({ src: it.mediaUrl ?? '', alt: it.label ?? `Image ${i + 1}` }))}
          captions={[]}
        />
      );
    case 'EMBED':
      return <Embed url={block.embedUrl ?? ''} />;
    case 'LINKS':
      return <Links items={block.items} />;
    case 'FACTS':
      return <FactsGrid items={block.items} />;
    case 'CHIPS':
      return <ChipList items={block.items} />;
  }
}

/** Raw HTML is never rendered (no rehype-raw); react-markdown also strips javascript: URLs. */
function TextBody({ body }: { body: string }) {
  return (
    <div className="pblock__text">
      <Markdown
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {body}
      </Markdown>
    </div>
  );
}

function ImageGrid({
  images,
  captions,
  single = false,
}: {
  images: { src: string; alt: string }[];
  captions: string[];
  single?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className={single ? 'pblock__image' : 'pblock__gallery'}>
        {images.map((img, i) => (
          <figure key={i} className="pblock__figure">
            <Tip label="View larger">
              <button
                type="button"
                className="pblock__zoom"
                aria-label={`View larger: ${img.alt}`}
                onClick={() => setOpen(i)}
              >
                <img src={img.src} alt={img.alt} loading="lazy" />
              </button>
            </Tip>
            {captions[i] && <figcaption>{captions[i]}</figcaption>}
          </figure>
        ))}
      </div>
      <Lightbox
        open={open !== null}
        index={open ?? 0}
        close={() => setOpen(null)}
        slides={images.map((img) => ({ src: img.src, alt: img.alt }))}
      />
    </>
  );
}

function Embed({ url }: { url: string }) {
  if (url.startsWith('https://open.spotify.com/embed/')) {
    const height = url.includes('/embed/track/') ? 152 : 352;
    return (
      <iframe
        className="pblock__spotify"
        title="Spotify"
        src={url}
        height={height}
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      />
    );
  }
  return (
    <div className="pblock__video">
      <iframe
        title="YouTube video"
        src={url}
        loading="lazy"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  );
}

function Links({ items }: { items: ProfileItem[] }) {
  return (
    <ul className="pblock__links">
      {items.map((it, i) => (
        <li key={i}>
          <a href={it.value ?? undefined} target="_blank" rel="noopener noreferrer">
            <BrandIcon url={it.value} />
            {it.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
