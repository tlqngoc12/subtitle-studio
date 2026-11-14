import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { paragraphs } from '../../lib/chapterText';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { DisclosureSummary } from '../ui/DisclosureSummary';
import './OriginalPanel.css';

const WIDE = '(min-width: 1024px)';

/**
 * The original text of a Wattpad chapter as read-only paragraphs. `activeIndex` is the paragraph that matches the one
 * the caret is in: it is tinted and scrolled into view inside this panel (never the page). From 1024 px the panel is
 * a column beside the editor; below that it is a disclosure above the editor, closed until opened.
 */
export function OriginalPanel({
  language,
  text,
  activeIndex,
  footer,
}: {
  language: 'en' | 'th';
  text: string;
  activeIndex: number | null;
  footer?: ReactNode;
}) {
  const wide = useMediaQuery(WIDE);
  const parts = useMemo(() => paragraphs(text), [text]);
  const active = useRef<HTMLParagraphElement>(null);
  const heading = `Original (${language === 'en' ? 'English' : 'Thai'})`;

  useEffect(() => {
    if (activeIndex !== null) active.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, wide]);

  const body = (
    <>
      <div className="chapter-original__text" role="region" aria-label="Original text" tabIndex={0} lang={language}>
        {parts.map((p, i) => {
          const isActive = i === activeIndex;
          return (
            <p
              key={i} // the paragraphs have no id: their order is their identity
              ref={isActive ? active : undefined}
              className={isActive ? 'chapter-original__p chapter-original__p--active' : 'chapter-original__p'}
              aria-current={isActive ? 'true' : undefined}
            >
              {p}
            </p>
          );
        })}
      </div>
      {footer}
    </>
  );

  if (wide) {
    return (
      <section className="chapter-original" aria-labelledby="chapter-original-heading">
        <h2 id="chapter-original-heading" className="history__heading">
          {heading}
        </h2>
        {body}
      </section>
    );
  }
  return (
    <details className="chapter-original chapter-original--disclosure">
      <DisclosureSummary>{heading}</DisclosureSummary>
      {body}
    </details>
  );
}
