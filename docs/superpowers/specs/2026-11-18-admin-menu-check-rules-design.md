# Admin menu groups + filling `## Kiểm tra` — design

Date: 2026-11-18. Branch: `feat/admin-menu-check-rules`. Size: medium (frontend nav/tabs, one frontend dialog, one
prompt line in the analyzer, two profile data files; no migration).

## Why

- **Menu.** The admin topbar has 8 items (Get Engsub, Vietsub, Vietsub list, Profile, Works, Photos, Novels,
  Settings). On a phone the user has to swipe sideways to see them all. The admin site should be grouped by scope.
  The public site keeps its menu as it is.
- **Check rules.** The Check button (PR #55) is disabled with "No rules in ## Kiểm tra" because no existing profile
  has that section. The user asked why they must write rules by hand, and picked all three remedies:
  1. one-time seeding of the existing profiles;
  2. "Add to check rules" from a selection in the chapter editor;
  3. the profile analyzer proposing rules from the user's corrections.

## 1. Admin menu (approach A: 4 groups, tabs inside)

| Topbar (admin) | Tabs (tab-routes, level 1) | Routes (unchanged) |
|---|---|---|
| **Vietsub** | Get Engsub · Videos · Playlists · Profiles · List | `/`, `/vietsub`, `/vietsub/playlists`, `/vietsub/profiles`, `/vietsub/list` |
| **Showcase** | Profile · Works · Photos | `/profiles`, `/works`, `/photos` |
| **Novels** | (unchanged) | `/novels…` |
| **Settings** | Gemini · Backups (unchanged) | `/settings…` |

- **Group name "Showcase"** is a placeholder: the user had not chosen a name and can rename it at review. It is one
  constant.
- **No URL changes.** Bookmarks and the public site keep working. Only the topbar items and the tab rows change.
- **Topbar "current" rules:**
  - Vietsub is current for `/` and every `/vietsub…` path. This includes the watch page `/vietsub/:id` and playlist
    detail pages.
  - Showcase is current for `/profiles…`, `/works…` and `/photos…`.
- **Tabs** use the existing underline tab style (`tabs__list`, links with `aria-current="page"`), like
  `VietsubTabs` and `SettingsTabs`.
  - `VietsubTabs` gets the two new tabs: Get Engsub first, List last.
  - A new `ShowcaseTabs` component serves Profile, Works and Photos.
  - The tab row is shown on each group's level-1 pages: the Get Engsub home, the Vietsub list page, the Profile
    page, the Works list and the Photos page.
  - Level-2 pages (watch page, work detail/edit, playlist detail) keep their breadcrumbs and show no tab row. Their
    first crumb stays the page's own section label (for example "Works"), as today.
- **The public site is unchanged.** It keeps the same 5 top items, and the tab rows are not shown in read-only mode.
  This matters because the pages are shared between the admin and public apps.
- **Phone:** 4 items fit at 360 px without horizontal scroll. The tab rows may scroll horizontally, as tab rows
  already do.
- **Layout and colors:** follow `docs/ui/screen-layout.md`, and use the purple selected underline as today.

## 2. Seed `## Kiểm tra` in existing profiles (one time, data files)

Only phrases that are wrong in **every** context of that novel are seeded. Context-dependent pairs are not, for
example "vì chị" → "vì tôi", which is right only when Emi speaks. The section goes before
`## Tóm tắt nội dung chính`, or at the end if that heading is missing.

- `data/prompts/novels/BreathlessLesson.md`
  ```
  ## Kiểm tra
  - "cảm xúc trẻ con" → "cảm xúc bồng bột" (văn phong tiết chế)
  - "sự vâng lời" → "sự hợp tác" (văn phong tiết chế)
  - "mẹ cô" → "mẹ em" (lời dẫn về Bonnie dùng "em")
  ```
- `data/prompts/novels/MyGrumpyVampire.md`
  ```
  ## Kiểm tra
  - "cô ta" → "cô" | "em" (Emi là "cô", Bonnie là "em"; không dùng "cô ta")
  - "bà ta" → "cô" (không dùng "bà ta" cho Emi)
  - "ả" → "cô" (không dùng "ả" cho Emi)
  ```

The other 8 profiles get nothing now. Feature 2 creates the section the first time a rule is added.
`ROOM520ILoveYou.md` has an uncommitted edit by the user, so it must not be touched or committed.

## 3. "Add to check rules" (chapter page)

- **Entry:** an "Add to check rules" button (secondary, S) in the Chapter text label row, next to the Check toggle.
  - It is enabled when the textarea selection is non-empty, at most 60 characters, contains no newline and no `"`,
    and the novel has a profile.
  - Otherwise it is disabled, with a tooltip saying why.
- **Dialog (Radix, small form):**
  - **Wrong phrase**: prefilled with the trimmed selection, editable, required.
  - **Suggestions**: one input. Several suggestions are separated by `|`. The field may be empty (flag only).
  - **Reason**: optional.
  - Buttons: Cancel / **Add rule** (primary, orange).
- **Save:**
  1. Fetch the profile (`getNovelProfile`, which gives the text and sha).
  2. Insert the formatted line with `addCheckRule(profile, rule)`. If a rule with the same wrong phrase exists
     (compared case-insensitively, NFC), it replaces that line. Otherwise it appends at the end of the `## Kiểm tra`
     section, creating the section before `## Tóm tắt nội dung chính` (or at the end) when it is missing.
  3. Save with `saveNovelProfile(novelId, text, sha)`. On a sha conflict, refetch and retry once, then show the
     error.
  4. Show a toast, "Rule added". The Check rules reload, so a Check that is on shows the new hit at once.
- **Format** (`formatCheckRule`), round-tripping with `parseCheckRules`:
  - `- "<wrong>" → "<s1>" | "<s2>" (<reason>)`
  - `- "<wrong>" → (tránh dùng)` when there are no suggestions.

## 4. Analyzer proposes `## Kiểm tra` lines

Add one line to `NovelProfileAnalyzer.SYSTEM_RULES`, after the line about the "Tên riêng / Xưng hô" sections:

```
- Cụm từ mà người dịch sửa GIỐNG NHAU ở ít nhất 2 đoạn và luôn sai trong truyện này (không phụ thuộc ai nói hay ngữ cảnh) thì thêm vào mục "## Kiểm tra" (tạo mới trước "## Tóm tắt nội dung chính" nếu chưa có), mỗi dòng đúng dạng: - "cụm sai" → "cụm đúng" (lý do). Không thêm cụm phụ thuộc ngữ cảnh; giữ nguyên các dòng đã có trong mục này.
```

The proposed rules also appear in the existing `rules` list, with their count, so the user reviews them in the
Analyze panel before Save. No schema change.

## Non-goals

- No change to the public topbar or public pages.
- No rule editor beyond the add dialog. Rules are edited in the Profile tab.
- No automatic seeding of other profiles.
- No new endpoints.

## Tests

- **NavBar:**
  - The admin topbar shows exactly Vietsub, Showcase, Novels, Settings.
  - The public topbar is unchanged (5 items).
  - The current item for `/`, `/vietsub/list`, `/vietsub/123`, `/works/5`, `/photos`.
- **Tabs:**
  - VietsubTabs has 5 tabs, with the right current tab per path.
  - ShowcaseTabs is shown on the Profile, Works and Photos pages in admin and is absent in public.
- **`formatCheckRule` / `addCheckRule`:**
  - appends a line;
  - creates the section before Tóm tắt;
  - creates it at the end when there is no Tóm tắt;
  - replaces the same wrong phrase (case-insensitive);
  - flag-only format;
  - a format → parse round trip.
- **Add-rule dialog:**
  - disabled states (no selection, >60 chars, newline, quote, no profile);
  - prefill;
  - save calls with the new text and the sha;
  - a conflict retries once;
  - Check refreshes after save.
- **Analyzer:** `SYSTEM_RULES` contains the `## Kiểm tra` instruction.
- **Seed data:** after the edit, `parseCheckRules` of both files gives 3 rules and 0 ignored. Check this with a
  quick script or test; no permanent test is needed on data files.

## Left to the builder

- The exact tooltip wording and dialog layout.
- Whether `ShowcaseTabs` and `VietsubTabs` share a small generic `RouteTabs` component (preferred if trivial).
