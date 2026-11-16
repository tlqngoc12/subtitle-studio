import { Copy } from 'lucide-react';
import Lightbox, { useLightboxState } from 'yet-another-react-lightbox';
import Captions from 'yet-another-react-lightbox/plugins/captions';
import 'yet-another-react-lightbox/plugins/captions.css';
import 'yet-another-react-lightbox/styles.css';
import type { PageDto } from '../../api/novels';

/** Lightbox toolbar button: copies the Thai text Gemini read from the slide on screen; hidden when there is none. */
function CopySourceButton({ sources }: { sources: (string | null)[] }) {
  const { state } = useLightboxState();
  const source = sources[state.currentIndex];
  if (!source) return null;
  return (
    <button className="yarl__button" type="button" aria-label="Copy source"
      onClick={() => void navigator.clipboard.writeText(source)}>
      <Copy className="icon" aria-hidden="true" />
    </button>
  );
}

/** The enlarged page screenshots, each with the text Gemini read from it. `index` null = closed. */
export function ChapterLightbox({ pages, index, onClose }: { pages: PageDto[]; index: number | null; onClose: () => void }) {
  return (
    <Lightbox
      open={index !== null}
      index={index ?? 0}
      close={onClose}
      plugins={[Captions]}
      captions={{ descriptionMaxLines: 12 }}
      toolbar={{ buttons: [<CopySourceButton key="copy-source" sources={pages.map((p) => p.source)} />, 'close'] }}
      slides={pages.map((p, i) => ({
        src: p.mediaUrl,
        alt: `Page ${i + 1}`,
        title: `Page ${i + 1}`,
        description: p.source ? `Source read by AI:
${p.source}` : undefined,
      }))}
    />
  );
}
