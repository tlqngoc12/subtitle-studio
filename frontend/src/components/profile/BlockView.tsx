import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import Markdown from 'react-markdown';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import type { ProfileBlock, ProfileItem } from '../../api/profiles';

/** One profile block in view mode. */
export function BlockView({ block }: { block: ProfileBlock }) {
  return (
    <section className="pblock">
      {block.title && <h2 className="pblock__title">{block.title}</h2>}
      <BlockBody block={block} />
    </section>
  );
}

function BlockBody({ block }: { block: ProfileBlock }) {
  switch (block.type) {
    case 'TEXT':
      return <TextBody body={block.body ?? ''} />;
    case 'IMAGE': {
      const alt = block.caption ?? block.title ?? 'Ảnh';
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
          images={block.items.map((it, i) => ({ src: it.mediaUrl ?? '', alt: it.label ?? `Ảnh ${i + 1}` }))}
          captions={[]}
        />
      );
    case 'EMBED':
      return <Embed url={block.embedUrl ?? ''} />;
    case 'LINKS':
      return <Links items={block.items} />;
    case 'FACTS':
      return <Facts items={block.items} />;
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
            <button
              type="button"
              className="pblock__zoom"
              aria-label={`Xem ảnh lớn: ${img.alt}`}
              title="Xem ảnh lớn"
              onClick={() => setOpen(i)}
            >
              <img src={img.src} alt={img.alt} loading="lazy" />
            </button>
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
        title="Video YouTube"
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
            <ExternalLink className="icon" aria-hidden="true" />
            {it.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Facts({ items }: { items: ProfileItem[] }) {
  return (
    <table className="pblock__facts">
      <tbody>
        {items.map((it, i) => (
          <tr key={i}>
            <th scope="row">{it.label}</th>
            <td>{it.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
