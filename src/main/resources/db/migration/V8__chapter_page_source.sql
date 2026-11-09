-- The Thai text Gemini read from a page image, returned in the same request as the translation. NULL = unknown
-- (translated before this column, or Gemini sent none); such pages are never flagged as incomplete.
-- Never edit this file once it has run on a real database; add V9__... instead.

ALTER TABLE t_chapter_page ADD (source_th CLOB);
