-- A label that only repeats the chapter's own default name ("Chapter 16" on chapter 16) is the same as no label, and
-- hides the real "Chương N" on the public page. Clear them; the editor now stores such a label as NULL.
-- Labels such as "Ngoại truyện 1", "Special" or "Chapter 16.5" are left alone.
-- Never edit this file once it has run on a real database; add V22__... instead.

UPDATE t_chapter SET label = NULL
 WHERE label IS NOT NULL
   AND (TRIM(label) IN ('Chapter ' || chapter_no, 'chapter ' || chapter_no, 'Chương ' || chapter_no, 'chương ' || chapter_no));
