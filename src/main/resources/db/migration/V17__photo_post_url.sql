-- A photo post can now link to an Instagram or an X post, so the column loses its Instagram-only name.
-- Same conventions as V1-V16. Never edit this file once it has run on a real database; add V18__... instead.
-- The unique constraint and its index follow the column, so duplicates are still rejected on the normalised link.

ALTER TABLE t_photo_post RENAME COLUMN instagram_url TO post_url;
