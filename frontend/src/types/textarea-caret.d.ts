declare module 'textarea-caret' {
  /** Where the character at `position` sits inside the field: pixels from its top-left padding edge, plus the line height. */
  export default function getCaretCoordinates(
    element: HTMLTextAreaElement | HTMLInputElement,
    position: number,
  ): { top: number; left: number; height: number };
}
