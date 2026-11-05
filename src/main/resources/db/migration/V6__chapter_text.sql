-- The whole chapter's Vietnamese text, edited in one box (Novels). NULL = not edited yet: the page texts
-- (t_chapter_page.text_vi, Gemini's translation) joined with a blank line stand for it.
-- Never edit this file once it has run on a real database; add V7__... instead.

ALTER TABLE t_chapter ADD (text_vi CLOB);
