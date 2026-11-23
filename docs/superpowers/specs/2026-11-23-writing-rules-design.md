# Writing rules + repetition Check — design

Date: 2026-11-23. Branch (to create from `main`): `feat/writing-rules`. Size: medium. Mostly frontend; the backend
only reads and writes one Markdown file.

**Scope: original stories only** (`sourceType = ORIGINAL`, the stories the user has an AI write). Translated novels
(`SCREENSHOTS`, `WATTPAD`) and the Gemini translation prompt are not touched; their Check works exactly as today.

## Why

The user has stories written by an AI (ChatGPT/Claude Project, outside the app) and kept in the app as original
stories. The prose reads like "văn mẫu": worn phrases ("cúi đầu", "tim đập thình thịch"…) and the same phrase or
sentence shape repeated many times. Today the user hunts these by hand, and the lessons are scattered over each
story's `TIEN-DO.md`, prompts and instructions (the Bóng Lưng instructions are already 7,988 / 8,000 characters).

The user wants:
1. **One rule set, kept in one place, edited by hand**, with a **button that exports it** as text ready to paste
   into an AI's Instructions or Project Bible, so the writing AI avoids the mistakes up front.
2. **A review aid**: the chapter Check marks banned phrases and repetitions automatically, so the second read is
   lighter.

Success: the user pastes the export once per story, and on the chapter page Check shows every banned phrase and
every repeated phrase/sentence opening without the user having declared them first.

## Goals / non-goals / anti-goals

- Goals: a global rule set (Settings), per-story additions and opt-outs (profile), "Copy for AI" export (global and
  per story), Check on original-story chapters catches global banned phrases + auto-detected repetitions.
- Non-goals: **no Gemini/LLM review** (user picked approach 1); **the rules are not added to the Gemini translation
  prompt** (user: they are for AI-written stories only); nothing changes for translated novels; no automatic
  rewrite of repeated text; no check of point of view, pronoun-by-context, pacing or dialogue length (rules 1–4 are
  export-only); no change to the public reader; no cross-chapter repetition.
- Anti-goals: Check drowning the chapter in false alarms (character names, common words); the export being so long
  it does not fit next to existing instructions; the global rules breaking a story whose canon needs a banned
  detail (Safeword: Rin removes her watch before each scene).

## Approaches (user picked 1)

1. **Upgrade Check, no AI** — banned phrases + statistical repetition finder in the browser. Free, instant, never
   invents an error; cannot judge rules 1–4 or propose rewrites. **Picked.**
2. Gemini "style review" listing old sentence → proposed sentence. Covers all rules, but costs quota and can miss or
   over-edit. Not now.
3. Both combined. Deferred; approach 1 is its first half.

## The rule set

### Global rules (Settings › Writing rules)

One Markdown file, **`<promptsDir>/writing-rules.md`** (i.e. `data/prompts/writing-rules.md`, next to the novel
profiles in `data/prompts/novels/`; user's choice, so it can also be edited outside the app and is covered by the
existing backup of `data/`). Edited in the app in a plain textarea, saved with Save (Ctrl+S); the app re-reads the
file on every GET, so outside edits show up on reload. Three known sections; anything else is kept and exported as
is:

```
## Nguyên tắc viết
- Ngôi kể là ngôi thứ ba, không luân phiên góc nhìn.
- Giọng văn tiểu thuyết hiện đại, mượt mà, tự nhiên…
- …

## Cụm cấm
- "cúi đầu"
- "ngẩng đầu"
- "tim đập thình thịch"
- "ánh mắt sâu thẳm" → (tránh dùng) (sáo rỗng)
- …

## Chi tiết cấm
- "đeo đồng hồ"
- "tháo đồng hồ"
- "mùi dầu gội"
- "mùi nước hoa"
```

- `## Nguyên tắc viết`: prose, export only, never checked.
- `## Cụm cấm` and `## Chi tiết cấm`: rule lines in the **same format as `## Kiểm tra`** (see
  `2026-11-18-chapter-check-rules-design.md`), plus one addition: a bare quoted phrase `- "cúi đầu"` means flag only
  (same as `→ (tránh dùng)`). The addition also applies to `## Kiểm tra`.
- **Seed:** when the file does not exist, Check and both exports use the seed text as the global rules (so the
  feature works before the first Save), and the editor opens pre-filled with the user's 7 rules (the 5 prose
  rules under `## Nguyên tắc viết`, the phrases of rules 6–7 as lines). The Bóng Lưng pronoun rule (Emi = "cô",
  Bonnie = "em") is story-specific, so it goes in that story's profile, not in the seed. Seed text lives in the
  frontend as a constant.

Seed phrases (rule 6): "cúi đầu", "ngẩng đầu", "tim đập thình thịch", "ánh mắt sâu thẳm", "im lặng đến đáng sợ",
"không trả lời ngay", "im lặng không nói", "không đáp ngay". Rule 7: "đeo đồng hồ", "tháo đồng hồ", "mùi dầu gội",
"mùi nước hoa". Rule 6's last sentence ("Đa dạng hóa từ vựng…") goes under `## Nguyên tắc viết`.

### Per-story rules (novel profile)

Two additions to the profile Markdown (file `data/prompts/novels/<slug>.md`):

- `## Nguyên tắc riêng` (new, optional): prose, export only. Example: "Nhắc đến Emi dùng "cô", nhắc đến Bonnie
  dùng "em"."
- In the existing `## Kiểm tra`, a new line kind: `- bỏ luật chung: "tháo đồng hồ"` turns off that global banned
  phrase for this story (Check and export). Matching on the quoted phrase is case-insensitive, NFC. A phrase that is
  not in the global rules is ignored and counted in the existing "lines could not be read" note.
- Also in `## Kiểm tra`: `- bỏ qua lặp: "Khun Emi"` — the repetition finder never reports a repeat made only of
  this phrase or containing it (for names and catch-phrases that repeat on purpose, like "Màn trập.").

Only `_novel_template_original.md` gets an empty `## Nguyên tắc riêng` and a hint line in `## Kiểm tra` mentioning
the two new line kinds. The translation templates are not changed. Existing profiles are not rewritten. In a
translated novel's profile these line kinds have no effect (they are simply not read).

### Effective rules for a story

effective = global `Nguyên tắc viết` + global banned phrases − `bỏ luật chung` + story `Nguyên tắc riêng` + story
`Kiểm tra` rules. One pure function (`lib/writingRules.ts`) builds it from the two texts; Check and both exports use
it.

## Export ("Copy for AI")

Copies plain text to the clipboard and shows a toast "Copied N characters". Format:

```
QUY TẮC VĂN PHONG (bắt buộc)

Nguyên tắc viết:
- …
Nguyên tắc riêng của truyện này:        ← only in the per-story export, only if present
- …
Tuyệt đối không dùng các cụm sau:
- "cúi đầu", "ngẩng đầu", "tim đập thình thịch", …   ← one line, comma-joined, to save characters
Không dùng các chi tiết sau:
- "đeo đồng hồ", …
Không lặp một cụm từ quá 2 lần trong một chương; không mở đầu 3 câu liền nhau bằng cùng một cách.
```

- Suggestions and reasons from rule lines are not exported (they are for the reviewer, and cost characters).
  Per-story `Kiểm tra` corrections ("mẹ cô" → "mẹ em") **are** exported as `- Viết "mẹ em", không viết "mẹ cô".`
  under a "Sửa đúng:" heading, because they tell the AI the right form.
- The last line restates the repetition thresholds so the AI and Check agree.
- Where: Settings › Writing rules (global only) and the Profile tab of an **original** story (effective rules for
  that story). The button is not shown for translated novels.

## Check upgrade (chapter page of an original story)

For chapters of translated novels, Check is unchanged. For chapters of original stories, Check now has three issue
kinds. The existing toggle, ‹ › navigation, popover and count stay; the count is the total.

1. **Banned phrase** — global `Cụm cấm` / `Chi tiết cấm` minus opt-outs, plus the story's `Kiểm tra` rules. Same
   matching as today (whole words, case-insensitive, NFC, image lines skipped). Purple wavy underline as today.
2. **Repeated phrase** — found automatically:
   - Words = runs of Unicode letters/digits, compared lower-case NFC. Sentence/line breaks end an n-gram (no
     n-gram crosses `.?!…` or a newline).
   - Report an n-gram of 3–6 words that occurs **3 or more times** in the chapter.
   - Keep only maximal ones: drop an n-gram when a longer reported n-gram contains it with the same count.
   - Skip n-grams made only of stop words (small built-in Vietnamese list: "của", "và", "là", "thì", "một", "cái",
     "những", "các", "đã", "đang", "sẽ", "không", "có", "này", "đó", "ấy"… — builder finalizes the list), and those
     matching a `bỏ qua lặp` phrase.
   - Popover: "Repeated 4× — "ánh mắt cô dừng lại"" and its own ‹ › to jump between the occurrences. No
     suggestion chips.
3. **Repeated opening** — 3 or more consecutive sentences (in text order, across paragraphs, image lines skipped,
   dialogue included) whose first two words are the same (lower-case NFC). One issue per run, underlining the first
   two words of each sentence in the run. Popover: "3 sentences in a row start with "Em đã"".

- Look: repeated phrase and repeated opening use an **orange (`--brand`) dotted underline**, so they read
  differently from banned phrases (purple wavy). Red is not used — these are warnings for the reviewer.
- Overlaps: a banned phrase wins over a repeat at the same spot; otherwise all marks show.
- Check is no longer disabled when the profile has no `## Kiểm tra` rules; it is disabled only when there are no
  global rules **and** no profile rules **and** the chapter is empty, or the editor is locked (translating).
- Rules are reloaded when Check is switched on (global `writing-rules.md` + profile), as today for the profile.
- Thresholds (3–6 words, ≥3 times, ≥3 sentences, 2 opening words) are constants in one place; not user-editable.

## UI scope

| Menu | Route | Content |
|---|---|---|
| Settings › **Writing rules** (new tab, after Gemini) | `/settings/writing-rules` | Textarea with the global rules (seeded), Save, **Copy for AI**, a short help line on the 3 sections and line formats |
| Novels › an original story › Profile tab | `/novels/:id` | **Copy for AI** button in the Profile toolbar (effective rules for this story) |
| Novels › a chapter of an original story | `/novels/:id/chapters/:chapterId` | Check marks global banned phrases, repeated phrases, repeated openings |

Follow `docs/ui/screen-layout.md` (breadcrumb, H1, actions, FormActions) and the color rule (orange `#F39A42` /
purple `#D9A1D9`, text on them `#1B2430`, red only for errors/delete). Labels in English like the rest of the admin
UI; rule text and export text in Vietnamese. Icons from `lucide-react`.

## API

- `GET /api/settings/writing-rules` → `{ text: string | null }` (null = file missing → frontend shows the seed).
- `PUT /api/settings/writing-rules` `{ text }` → 204; writes `writing-rules.md` as UTF-8 (atomic write: temp file +
  move, like the profile store). Max length 20,000 characters (400 ProblemDetail beyond).

## Tests

- `writingRules`: section parsing, bare-quote flag-only, `bỏ luật chung`, `bỏ qua lặp`, effective rules merge,
  export text (per-story heading only when present, "Sửa đúng" lines, comma-joined phrases).
- Repetition finder: 3× threshold, maximal n-grams, no crossing sentence ends, stop-word-only skipped, ignore
  phrases, Vietnamese diacritics/NFC, image lines skipped; openings run of 3 across paragraphs, run of 2 not
  reported.
- Components: Writing rules tab (seed when null, save, copy + toast), Profile tab Copy for AI, Check showing the
  three kinds with the right look and counts, repeat popover navigation; a translated novel's chapter Check behaves
  as before and its Profile tab has no Copy for AI.
- Backend: endpoint (get when file missing → null, put writes the file, get after an outside edit returns it, too
  long → 400).

## Decided by the user

- Approach 1 (no AI review). Rules editable by hand, exportable with a button.
- Global rules stored as a `.md` file.
- Original stories only; the translation prompt does not get the rules.

## Calls made by Claude (user can override)

- File location `data/prompts/writing-rules.md`.
- Bare quoted phrase = flag only; `bỏ luật chung:` / `bỏ qua lặp:` line syntax.
- Thresholds 3–6 words, ≥3 occurrences, ≥3 sentences with the same 2 opening words.
- Orange dotted underline for repeats, purple wavy kept for banned phrases.
- Export wording and the comma-joined phrase line; corrections exported as "Sửa đúng".

## Left to the builder

- Final stop-word list; the help text wording; how the mirror-highlight layer draws two underline styles.
- Exact placement of the repetition finder (`lib/repetition.ts` suggested).
