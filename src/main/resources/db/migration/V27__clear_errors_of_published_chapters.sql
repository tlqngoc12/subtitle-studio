-- A chapter whose Gemini translation failed kept translation_status = 'FAILED' and its error even after the text was
-- written by hand and published. From now on publishing clears them; this cleans up the chapters published before.
-- Statuses are stored as enum names (V5). Unpublished chapters keep their error.
-- Never edit this file once it has run on a real database; add V28__... instead.

UPDATE t_chapter SET translation_status = 'TRANSLATED', translation_error = NULL
 WHERE publish_status = 'PUBLISHED' AND translation_status = 'FAILED';
