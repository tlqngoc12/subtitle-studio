-- Keeps Gemini's whole-chapter translation next to the text the translator edits afterwards, so the corrected
-- paragraphs can be found later (spec docs/superpowers/specs/2026-11-16-novel-profile-analyze-design.md).
-- Null for chapters translated before this migration and for chapters that were never translated.
-- Never edit this file once it has run on a real database.

ALTER TABLE t_chapter ADD (ai_text CLOB);
