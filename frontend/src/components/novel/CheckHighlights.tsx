import type { RefObject } from 'react';
import { FindHighlights, type Hit } from './FindHighlights';

/** The Check's wavy underlines: the find highlights' mirror (one copy of its style list), painted with another class. */
export function CheckHighlights({
  text,
  marks,
  textareaRef,
  boxRef,
}: {
  text: string;
  marks: Hit[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  boxRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <FindHighlights text={text} matches={marks} current={null} textareaRef={textareaRef} markClassName="check-hit" boxRef={boxRef} />
  );
}
