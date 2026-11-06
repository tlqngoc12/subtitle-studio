-- A chapter's display name instead of "Chapter N", e.g. "Ngoại truyện 1" or "Special". NULL = "Chapter N".
-- chapter_no stays the order, the public URL and the notebook version key.
-- Never edit this file once it has run on a real database; add V8__... instead.

ALTER TABLE t_chapter ADD (label VARCHAR2(100 CHAR));
