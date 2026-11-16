# Wattpad chapter images: design

Date: 2026-11-16. Status: draft for user review.

## Why

Today a Wattpad chapter that holds only images cannot be fetched. An example is "Character" of *Room 520 "I Love You"* (part 1631821143), which contains a cover and 3 character cards. Each card has a photo and an English description drawn inside the image. Fetching fails with `WATTPAD_PART_EMPTY` ("Wattpad has no text for this part").

The cause is in `WattpadText.toPlain`, which removes every `<img>`. The same thing happens to images inside ordinary text chapters (illustrations, chat screenshots): they are silently lost both in the editor and on the public site.

User decisions (2026-11-16):
- **Image-only chapter:** readers see each original image, with the Vietnamese translation of the text inside that image right below it. The translator can edit that translation like any chapter text.
- **Images in text chapters:** keep them in their exact place, in the editor and on the public site.

## Goals

1. **Fetching keeps images in place.**
   - `apiv2/storytext` `<img>` elements under `p[data-media-type=image]` (and any other `<img>` from a Wattpad image host) become an **image marker paragraph** in `source_text`, at the position where they appear.
   - The image is downloaded once and stored as `Media`, using the existing media storage. It is reused when the same chapter is reloaded with the same image URL.
   - A chapter with no text but at least one image is fetched normally. Only a chapter with neither text nor images is still `WATTPAD_PART_EMPTY`.
2. **The marker format** is one paragraph on its own: `[[image:<mediaId>]]`. Like every paragraph, it is separated by blank lines. The same marker appears in `source_text`, `ai_text` and `text_vi`.
3. **Translation reads the images.**
   - `GeminiTextChapterTranslator` sends every image of the part being translated as an inline image `Part`, in order and labelled with its marker, together with the text. Images are resized to at most 1600 px on the long side before sending, using the existing resize code.
   - The prompt rules are:
     - copy each marker line unchanged, in the same place;
     - if that image contains readable text that is part of the story (descriptions, messages, letters; not a logo or the title of the book), put the Vietnamese translation of that text immediately after the marker, as one or more paragraphs;
     - if the image has no such text, nothing follows the marker.
   - Still one request per chapter part. No extra Gemini call for text extraction.
   - The validation checks must not reject image-only chapters. Today these are the paragraph share, the length ratio and the mid-sentence ending. Count only the non-marker text of the source in those checks, and skip them when the source has no non-marker text.
   - An answer that drops or alters a marker is treated as incomplete: `TextIncompleteException`, with the normal fallback and retry. The set and order of markers in the answer must equal the source's.
4. **Editor (chapter page).**
   - **Translation textarea:** marker lines show as they are. That is enough for this version.
   - **Original panel:** shows the image itself (a thumbnail, at most the panel width) where a marker is.
   - **Paragraph tracking** (the caret → original paragraph highlight) aligns segment by segment: markers are anchors. Any extra translated paragraphs after a marker map to that marker's image in the original panel.
   - **Save:** if `text_vi` is missing a marker that `source_text` has, or contains a marker the chapter does not own, the save is rejected with a clear message (400, code `CHAPTER_IMAGE_MARKERS`). Images are not lost by accident.
5. **Public site.**
   - `NovelRenderer` splits the chapter text at markers. Text segments are rendered as today. Each marker becomes the original image, scaled to the format width and encoded and watermarked exactly like the rendered pages, inserted in reading order in the chapter's image list.
   - **Translation below each image:** the image's translation is just the text segment after the marker, so it is drawn right below the image.
   - **Reader:** nothing changes in `ReaderPage`. It already shows an ordered list of images.
6. **Gemini context stays clean.** Text sent to Gemini only as context has markers removed:
   - the previous chapter text;
   - the notebook update input;
   - the Analyze corrections input.

   Only the translation request itself carries markers and images.

## Non-goals

- **Screenshot (photo) novels.** They already work from images and are unchanged.
- **Automatic re-fetch of chapters already imported** without their images. The user can use the existing "Reload original" on a chapter that needs them, and then retranslate it or edit it by hand.
- **Image reordering or editing** in the editor.
- **Translating text inside images of the Vietsub feature.**

## Anti-goals

- An existing text-only chapter is translated, rendered or validated any differently. Its prompt may gain the image rules, but there must be no marker, no image part and no behaviour change.
- An image goes missing silently, at fetch, translate, save or render.
- Server-side fetching of anything outside Wattpad image hosts (`*.wattpad.com`, `https`). Keep the existing host check.

## Approaches considered

- **A. Markers in the chapter text (chosen).** One string per chapter, as today. Diff, Analyze, find & replace and save all keep working on text, and images ride along as anchored lines. The cost is that the marker lines are visible in the textarea and need the save guard.
- **B. A separate ordered "blocks" structure** (text blocks and image blocks) in a new table. This is cleaner for the UI, but every text consumer (editor, find & replace, Analyze, notebook, render, translation, ai_text) would have to change.
- **C. Extract image text with a separate Gemini OCR call at fetch time,** then treat it as source text. This costs one extra request per chapter with images, on a 20-per-day free tier, and the image's own text would never be shown as the original.

## Error handling

- **An image download fails** (non-200, too large, not an image):
  - Image-only chapter: the fetch fails with a clear `WattpadPartProblem` reason.
  - Mixed chapter: the image is skipped. The fetch result says how many images were skipped, so the UI can show "1 image could not be downloaded", and the log records the part id and count.
- **Size limits.** Images are capped at the existing max page image size (10 MB). For Gemini, at most 20 images per request after resizing. A part with more images is split at the existing text-split boundaries. If even one segment has more than 20 images, the translation fails with a clear message rather than silently dropping images.

## Testing (beyond unit tests per class)

- A `WattpadText` fixture made from the real part 1631821143 HTML (4 image paragraphs, no text) produces 4 markers.
- A mixed fixture keeps marker positions between paragraphs.
- Translator tests check:
  - the images are sent as parts;
  - the markers are preserved;
  - a dropped marker leads to `TextIncompleteException`;
  - an image-only source passes validation.
- Render test: a chapter with text–image–text produces the image list in that order.
- Save guard tests.
- Frontend tests: the original panel shows images, and the alignment around markers is correct.
- Manual check after deploy: fetch part 1631821143, translate it, and confirm in the editor and on a local public export that the 4 images appear, with Vietnamese text under the 3 character cards.

## Left to the builder

- How images are attached to the chapter: a join table, or the media id inside the marker plus an ownership check through `source_text`. If it needs a migration, it is V25.
- The exact prompt wording, within the rules above.
- The image watermark placement.
