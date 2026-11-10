-- The video's YouTube description, kept as context for Gemini translation (series names, cast). NULL = not fetched yet.
-- Never edit this file once it has run on a real database; add V13__... instead.

ALTER TABLE video ADD (description CLOB);
