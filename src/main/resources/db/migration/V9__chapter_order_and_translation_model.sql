-- Reading order of chapters, separate from chapter_no (the public URL and the notebook version key), and the Gemini
-- model that translated a chapter / a Vietsub. Old rows: sort_order = chapter_no, models NULL (nothing shown).
-- Never edit this file once it has run on a real database; add V10__... instead.

ALTER TABLE t_chapter ADD (sort_order ${int});
UPDATE t_chapter SET sort_order = chapter_no;
ALTER TABLE t_chapter MODIFY (sort_order NOT NULL);

-- Distinct models that answered, in order of use, joined by ", ".
ALTER TABLE t_chapter ADD (translation_model VARCHAR2(200 CHAR));
ALTER TABLE video ADD (translation_model VARCHAR2(200 CHAR));
