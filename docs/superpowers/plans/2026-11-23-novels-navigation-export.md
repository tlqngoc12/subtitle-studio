# Novels: breadcrumb, Export, chuyển chương, dòng chương 1 hàng, footer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (user rule: Sonnet implements every task, then one Opus review of the whole branch — no per-task review). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa 6 điểm vướng ở mục Novels (breadcrumb, Export trên thẻ truyện, Publish/Export chương trong menu ⋯, popover nhảy chương, dòng chương 1 hàng bằng icon) và câu footer public.

**Architecture:**
- **Backend:** thêm `GET /api/chapters/{id}/export`, dùng lại phần gom chữ và định dạng của `NovelExportService`. Thêm `position`/`chapterCount` vào `ChapterDetail`.
- **Frontend:**
  - Một helper cho crumb tab (dùng chung với `NovelsTabs`).
  - Một helper `saveBlob`.
  - Biến thể `compact` của `StatusBadges`.
  - Component mới `ChapterJump` (Radix Popover).

**Tech Stack:** Spring Boot (Java, JUnit, H2), React + Vite + TypeScript, Vitest + Testing Library, Radix Popover, lucide-react.

**Spec:** [docs/superpowers/specs/2026-11-23-novels-navigation-export-design.md](../specs/2026-11-23-novels-navigation-export-design.md)

## Global Constraints

- **Màu:** cam `#F39A42` (`--brand`), tím `#D9A1D9` (`--brand-2`), chữ trên hai màu này là `#1B2430`. Icon trên nền sáng dùng `--brand-ink` / `--brand-2-ink`. Đỏ chỉ dùng cho lỗi/xoá.
- **Bố cục** theo `docs/ui/screen-layout.md`:
  - crumb đầu là `Novels`;
  - crumb cuối không phải link;
  - dưới 521 px chỉ hiện `← {trang cha}`.
- **Nhãn tab:** admin là `Translated` / `Originals`, public là `Truyện dịch` / `Sáng tác`. Link: `/novels?tab=translated` | `/novels?tab=originals`.
- **Không bao giờ log** nội dung chương.
- **Mọi điều hướng** ở trang chương (crumb, `<`, `>`, popover) đi qua `leave(e, to)` để vẫn hỏi lại khi còn chỉnh sửa chưa lưu.
- **Icon** chỉ lấy từ `lucide-react`. Không thêm thư viện mới.
- Copy admin bằng tiếng Anh, copy public bằng tiếng Việt.
- **Commit message, tiêu đề và mô tả PR viết bằng tiếng Anh.** Một nhánh `feat/novels-navigation-export`, một PR. Không merge khi user chưa duyệt.
- **Trước khi báo xong:** chạy toàn bộ `mvn test` và `cd frontend && npm test`.

## Review Focus

1. **Truyện tự viết (`ORIGINAL`):** crumb phải là `Originals` / `Sáng tác`. Menu chương vẫn có Export, không có Translate. Popover không hiện icon dịch. → test trong Task 4, 5, 7.
2. **Chỉnh sửa chưa lưu:** Export chapter bị mờ với lý do "Save your changes first."; bấm một dòng trong popover thì hiện hộp hỏi lại. → test trong Task 5, 7.
3. **Tên chương rất dài, có ký tự HTML/Unicode** (`<b>`, emoji, tiếng Thái): dòng chương vẫn 1 hàng, tooltip hiện đủ tên; tên file zip vẫn hợp lệ. → test trong Task 1 (tên file), Task 6 (class `chapter-list__title` + Tip).
4. **Tìm có dấu/không dấu, theo số:** gõ `mua` khớp `Cơn mưa`; gõ `10` ra Chapter 10 trước Chapter 100; không có kết quả thì hiện "No chapters match.". → test trong Task 7.
5. **Reader public lúc chưa tải xong truyện** (`novel` = null): không hiện crumb tab sai; khi tải xong thì crumb đúng. → test trong Task 4.

---

### Task 1: Backend — export một chương

**Files:**
- Modify: `src/main/java/com/subtitlestudio/novel/NovelExportService.java`
- Modify: `src/main/java/com/subtitlestudio/novel/NothingToExportException.java`
- Modify: `src/main/java/com/subtitlestudio/novel/ChapterController.java`
- Test: `src/test/java/com/subtitlestudio/novel/NovelExportServiceTest.java`, `src/test/java/com/subtitlestudio/novel/ChapterControllerTest.java`

**Interfaces:**
- Produces:
  - `NovelExport NovelExportService.exportChapter(long chapterId)`;
  - `GET /api/chapters/{id}/export` → `200 application/zip` + `Content-Disposition: attachment; filename=…`;
  - `409 NOTHING_TO_EXPORT` khi chương không có chữ;
  - `404` (`ChapterNotFoundException`) khi không có chương.

- [ ] **Step 1: Viết test lỗi**

  Trong `NovelExportServiceTest`:
  - `exportsOneChapterAsMdAndHtml`: chương 3 có text "Xin chào".
    - Zip có đúng 2 entry, tên kết thúc bằng `.md` và `.html`.
    - Entry `.md` chứa `ChapterExportFormat.markdown(heading, "Xin chào")`.
    - `fileName()` bằng `"<slug>-chapter-3-<yyyy-MM-dd>.zip"`, ngày lấy từ `Clock` cố định của test.
  - `exportChapterWithoutTextThrows`: gọi trên chương rỗng → `NothingToExportException`.
  - `exportChapterUnknownThrows`: id `999999` → `ChapterNotFoundException`.

  Trong `ChapterControllerTest`:
  - `exportReturnsZip`: status 200, content type `application/zip`, header `Content-Disposition` chứa `.zip`.
  - `exportEmptyChapterIs409`: status 409, `code` = `NOTHING_TO_EXPORT`.

- [ ] **Step 2: Chạy và xác nhận test fail**

  Run: `mvn test -Dskip.npm -Dtest=NovelExportServiceTest+ChapterControllerTest`

  Expected: FAIL (`exportChapter` chưa có).

- [ ] **Step 3: Viết code**
  - Tách vòng lặp gom chữ hiện tại thành `private String textOf(Chapter c, List<ChapterPage> pages)` (sắp trang theo `position` rồi `ChapterText.of`). Dùng chung cho `export` và `exportChapter`.
  - `exportChapter`:
    - Lấy `fileBase(1, 1, heading)`, ghi 2 entry.
    - Tên zip là `novel.getSlug() + "-chapter-" + chapterNo + "-" + date + ".zip"`.
    - Log `"Exported chapter {} of novel {}"`, chỉ log id.
  - Thêm `static NothingToExportException forChapter(long chapterId)`, message `"Chapter <id> has no text to export"`. Handler trong `NovelErrors` giữ nguyên.
  - Controller: `@GetMapping("/api/chapters/{id}/export")`, viết giống `NovelController.export`.

- [ ] **Step 4: Chạy lại test**

  Run: lệnh như Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "feat(novel): export a single chapter as a zip"`

### Task 2: Backend — vị trí chương trong `ChapterDetail`

**Files:**
- Modify: `src/main/java/com/subtitlestudio/novel/ChapterDetail.java` (thêm 2 thành phần cuối `int position, int chapterCount`, cập nhật các constructor phụ và các `with…`)
- Modify: `src/main/java/com/subtitlestudio/novel/ChapterService.java:515` (`detail`)
- Modify: `frontend/src/api/novels.ts` (`ChapterDetail`: `position: number; chapterCount: number;`) và các fixture test frontend đang dựng `ChapterDetail`
- Test: `src/test/java/com/subtitlestudio/novel/ChapterServiceTest.java`

**Interfaces:**
- Produces: `ChapterDetail.position` (đếm từ 1, theo thứ tự đọc `sortOrder, chapterNo`) và `ChapterDetail.chapterCount`. Constructor phụ mặc định `position = 0`, `chapterCount = 0`.

- [ ] **Step 1: Viết test lỗi** `detailCarriesPositionAndCount`: truyện có 3 chương, chi tiết chương thứ 2 trả `position == 2`, `chapterCount == 3`.
- [ ] **Step 2: Chạy và xác nhận fail**

  Run: `mvn test -Dskip.npm -Dtest=ChapterServiceTest`
- [ ] **Step 3: Viết code**
  - Trong `detail(...)`, vòng lặp có sẵn ghi thêm `i + 1` và `all.size()`.
  - Thêm `withPosition(int position, int chapterCount)` theo kiểu của `withSourceType`.
- [ ] **Step 4: Chạy lại test**
  - `mvn test -Dskip.npm`: PASS toàn bộ.
  - `cd frontend && npx tsc --noEmit`: sạch (sau khi sửa fixture).
- [ ] **Step 5: Commit**

  `git commit -m "feat(novel): chapter detail tells its position and the chapter count"`

### Task 3: Frontend — `saveBlob`, API export chương, Export trên thẻ truyện

**Files:**
- Create: `frontend/src/lib/download.ts`, `frontend/src/lib/download.test.ts`
- Modify: `frontend/src/api/novels.ts` (+ `novels.test.ts`)
- Modify: `frontend/src/pages/NovelPage.tsx:97-115` (dùng `saveBlob`)
- Modify: `frontend/src/components/novel/NovelMenu.tsx` (+ `NovelMenu.test.tsx`)

**Interfaces:**
- Produces:
  - `saveBlob(blob: Blob, fileName: string): void`;
  - `exportChapter(id: number): Promise<{ blob: Blob; fileName: string }>` (fallback `chapter-<id>.zip`).

- [ ] **Step 1: Viết test lỗi**
  - `download.test.ts`: `saveBlob` tạo thẻ `a` có `download === fileName`, gọi `click()` và gỡ thẻ đi (spy `HTMLAnchorElement.prototype.click`).
  - `novels.test.ts`: `exportChapter` gọi `GET /api/chapters/7/export`, đọc tên file từ header; không có header thì là `chapter-7.zip`.
  - `NovelMenu.test.tsx`:
    - mục `Export` nằm ngay sau `Add to banner`;
    - bấm vào thì gọi `exportNovel(id)` rồi `saveBlob`;
    - `chapterCount: 0` thì nút bị disabled;
    - lỗi API thì có `toastError`.
- [ ] **Step 2: Chạy và xác nhận fail**

  Run: `cd frontend && npx vitest run src/lib/download.test.ts src/api/novels.test.ts src/components/novel/NovelMenu.test.tsx`
- [ ] **Step 3: Viết code**
  - Chuyển đoạn tạo link ở `NovelPage.exportChapters` sang `saveBlob`.
  - `exportChapter` viết theo mẫu `exportNovel`.
  - `NovelMenu`: thêm state `exporting`, nhãn `Exporting…` khi đang chạy, icon `Download`.
- [ ] **Step 4: Chạy lại test**

  Run: như Step 2. Expected: PASS.
- [ ] **Step 5: Commit**

  `git commit -m "feat(novel): export a whole novel from its card menu"`

### Task 4: Frontend — breadcrumb có cấp tab (admin + public)

**Files:**
- Modify: `frontend/src/components/fanfics/NovelsTabs.tsx`
- Modify:
  - `frontend/src/pages/NovelPage.tsx:157,166`
  - `frontend/src/pages/ChapterPage.tsx:118-122`
  - `frontend/src/pages/NovelNewPage.tsx:20,55`
  - `frontend/src/pages/public/PublicNovelsPage.tsx:77`
  - `frontend/src/pages/public/PublicNovelPage.tsx:182`
  - `frontend/src/pages/public/ReaderPage.tsx:193-202`
- Test: các file `*.test.tsx` tương ứng.

**Interfaces:**
- Produces (trong `NovelsTabs.tsx`):
  - `export const ADMIN_NOVELS_TAB_LABELS: Record<NovelsTab, string>` — giá trị mặc định hiện tại;
  - `export const PUBLIC_NOVELS_TAB_LABELS: Record<NovelsTab, string>` — `{ translated: 'Truyện dịch', originals: 'Sáng tác', fanfics: 'Fanfic' }`;
  - `export function novelsTabCrumb(original: boolean, labels: Record<NovelsTab, string>): { label: string; to: string }`.

  `PublicNovelsPage` đổi sang truyền `PUBLIC_NOVELS_TAB_LABELS`.

- [ ] **Step 1: Viết test lỗi**

  Mỗi trang kiểm `navigation "Breadcrumb"` chứa đúng chuỗi link, ví dụ:
  - `NovelPage`: truyện dịch → link `Translated` có `href` `/novels?tab=translated`; truyện `ORIGINAL` → link `Originals` có `href` `/novels?tab=originals`.
  - `ChapterPage`: `Novels › Translated › {novelTitle} › {chapter}`.
  - `NovelNewPage`: `New novel` → `Translated`; `New story` → `Originals`.
  - `PublicNovelPage`: `original: true` → `Sáng tác`.
  - `ReaderPage`:
    - khi `novel` chưa tải xong thì không có link `Truyện dịch` lẫn `Sáng tác`;
    - khi đã tải xong thì có link đúng (Review Focus 5).
  - `ChapterPage`: bấm crumb tab khi đang có chỉnh sửa chưa lưu → hộp hỏi lại hiện ra.
- [ ] **Step 2: Chạy và xác nhận fail**

  Run: `cd frontend && npx vitest run src/pages`
- [ ] **Step 3: Viết code**
  - Chèn `novelsTabCrumb(...)` vào sau crumb `Novels`.
  - Admin lấy `sourceType === 'ORIGINAL'`, public lấy `novel.original === true`.
  - `ReaderPage` chỉ chèn crumb tab khi `novel` đã có.
- [ ] **Step 4: Chạy lại test**

  Run: như Step 2. Expected: PASS.
- [ ] **Step 5: Commit**

  `git commit -m "fix(novel): breadcrumbs show the Translated/Originals level"`

### Task 5: Frontend — Publish vào menu ⋯, thêm Export chapter

**Files:**
- Modify: `frontend/src/components/novel/ChapterBar.tsx` (+ `ChapterBar.css`, `ChapterBar.test.tsx`)
- Modify: `frontend/src/pages/ChapterPage.tsx:88-111` (`menuItems`) (+ `ChapterPage.test.tsx`)

**Interfaces:**
- Consumes: `exportChapter`, `saveBlob` (Task 3).
- Produces: `ChapterMenuItem` thêm trường tuỳ chọn `icon?: LucideIcon`. `ChapterBar` không còn nút Publish ngoài thanh; prop `publish` giữ nguyên kiểu.

- [ ] **Step 1: Viết test lỗi**

  `ChapterBar.test.tsx`:
  - Không có button `Publish` nào nằm ngoài popover.
  - Mở menu thì `Publish` là mục đầu tiên. Lý do bị chặn hiện qua `Tip` (`Save first` khi chưa lưu).
  - Nút `Chapter actions` không còn class `chapter-bar__menu--phone-only`.

  `ChapterPage.test.tsx`, thứ tự mục trong menu:
  - chương draft dịch: `Publish, Export chapter, Translate…`;
  - chương published: `Unpublish, Export chapter`;
  - chương `ORIGINAL` draft: `Publish, Export chapter`.

  `ChapterPage.test.tsx`, Export chapter:
  - text rỗng → disabled, `Tip` "This chapter has no text yet.";
  - đang dirty → "Save your changes first.";
  - bấm vào → gọi `exportChapter(id)` rồi `saveBlob`.
- [ ] **Step 2: Chạy và xác nhận fail**

  Run: `cd frontend && npx vitest run src/components/novel/ChapterBar.test.tsx src/pages/ChapterPage.test.tsx`
- [ ] **Step 3: Viết code**
  - Bỏ khối nút Publish ngoài thanh và class phone-only của mục Publish trong menu. Bỏ cả CSS phone-only giờ đã thừa.
  - Thêm mục `Export chapter` (icon `Download`) vào ngay sau Unpublish trong `menuItems` (với chương draft thì nó là mục đầu của `menuItems`). Lý do mờ: `!text.trim()` → câu thứ nhất; `dirty` → câu thứ hai.
  - Render `item.icon` nếu có.
- [ ] **Step 4: Chạy lại test**

  Run: như Step 2. Expected: PASS.
- [ ] **Step 5: Commit**

  `git commit -m "feat(novel): Publish and Export chapter live in the chapter menu"`

### Task 6: Frontend — `StatusBadges compact` + dòng chương 1 hàng

**Files:**
- Modify: `frontend/src/components/novel/StatusBadges.tsx` (+ `StatusBadges.test.tsx`)
- Modify: `frontend/src/components/novel/ChapterList.tsx:118-140`, `ChapterList.css`

**Interfaces:**
- Produces: `StatusBadges` thêm prop `compact?: boolean` (mặc định `false`, giữ nguyên dạng cũ). Bảng icon theo spec §5:

  | Trạng thái | Icon | Màu |
  |---|---|---|
  | NONE | `CircleDashed` | muted |
  | TRANSLATING | `LoaderCircle` + class xoay | tím |
  | TRANSLATED | `Languages` | tím |
  | Fallback model | `Replace` | tím |
  | FAILED | `CircleAlert` | đỏ |
  | DRAFT | `FilePen` | muted |
  | PUBLISHED | `Globe` | cam |

  Dùng class `status-icon status-icon--muted|--brand-2|--brand|--failed`, màu lấy từ `--muted`, `--brand-2-ink`, `--brand-ink`, `--danger` (token có sẵn).

- [ ] **Step 1: Viết test lỗi**

  `StatusBadges.test.tsx` với `compact`:
  - không có chữ `Translated` hay `Published` hiện ra ngoài (dùng `queryByText`);
  - có element `aria-label="Translated by gemini-x"` và `aria-label="Published"`;
  - fallback có `aria-label` chứa `re-translate`;
  - không `compact` thì snapshot giống hành vi cũ.

  Test dòng chương (đặt trong `NovelPage.test.tsx`, nơi đang render `ChapterList`):
  - tên nằm trong `.chapter-list__title`;
  - số trang có `aria-label="12 pages"`.
- [ ] **Step 2: Chạy và xác nhận fail**

  Run: `cd frontend && npx vitest run src/components/novel/StatusBadges.test.tsx src/pages/NovelPage.test.tsx`
- [ ] **Step 3: Viết code**
  - `ChapterList` truyền `compact`.
  - Số trang đổi thành `Images` + số, kèm `Tip`/`aria-label`.
  - CSS `chapter-list__row` / `chapter-list__open`: `flex-wrap: nowrap`; title `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`, bọc `Tip` tên đầy đủ.
  - Icon xoay tôn trọng `prefers-reduced-motion`.
- [ ] **Step 4: Chạy lại test**

  Run: như Step 2, rồi chạy thêm `npx vitest run src/contrast.test.ts src/brandRoles.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**

  `git commit -m "feat(novel): one-line chapter rows with status icons"`

### Task 7: Frontend — popover `ChapterJump`

**Files:**
- Create: `frontend/src/components/chapter/ChapterJump.tsx`, `ChapterJump.css`, `ChapterJump.test.tsx`
- Modify: `frontend/src/components/chapter/ChapterNav.tsx` (đặt `ChapterJump` giữa `<` và `>`)

**Interfaces:**
- Consumes:
  - `getNovel(id)`;
  - `ChapterSummary`;
  - `chapterLabel`;
  - `StatusBadges compact` (Task 6);
  - `ChapterDetail.position/chapterCount` (Task 2);
  - `normalizeForSearch` (`lib/search.ts`).
- Produces: `ChapterJump({ novelId, currentId, position, total, original, chapterPath, onLeave }: { novelId: number; currentId: number; position: number; total: number; original: boolean; chapterPath: (id: number) => string; onLeave: (e: MouseEvent<HTMLAnchorElement>, to: string) => void })`.

- [ ] **Step 1: Viết test lỗi** (`ChapterJump.test.tsx`, dùng `fakeFetch`)
  - Nút có nhãn `3 / 42` và tooltip `All chapters`.
  - Bấm nút → gọi `GET /api/novels/:id` **một lần**; mở lại lần hai không gọi lại.
  - Focus nằm trong ô `Find a chapter…`.
  - Dòng đang mở có `aria-current="page"`.
  - Lọc:
    - gõ `mua` → còn `Chapter 3 · Cơn mưa`;
    - gõ `10` → `Chapter 10` đứng trước `Chapter 100`;
    - gõ `zzz` → `No chapters match.`.
  - Bàn phím: `ArrowDown` rồi `Enter` → `onLeave` được gọi với `chapterPath(id)` của dòng kế tiếp.
  - `Escape` → popover đóng.
  - Lỗi API → hiện `Couldn't load chapters.` + nút `Retry`.
  - `original` = true → không có icon `Translated` (`aria-label`).
- [ ] **Step 2: Chạy và xác nhận fail**

  Run: `cd frontend && npx vitest run src/components/chapter/ChapterJump.test.tsx`
- [ ] **Step 3: Viết code**
  - Radix `Popover` + `PopoverPanel` (giống `NovelMenu`). Nút dùng icon `List`.
  - Danh sách là các `Link`, `onClick` gọi `onLeave`.
  - Khi mở popover: `scrollIntoView({ block: 'nearest' })` cho dòng hiện tại.
  - **Thứ tự lọc:** khớp số chương chính xác trước, rồi đến tên chứa chuỗi đã chuẩn hoá. Trong mỗi nhóm giữ thứ tự đọc.
  - Panel `width: 320px; max-height: 60vh; overflow-y: auto`. Dòng hiện tại: nền `--brand-2`, chữ `#1B2430`.
- [ ] **Step 4: Chạy lại test**
  - Run: như Step 2, rồi chạy thêm `npx vitest run src/pages/ChapterPage.test.tsx`. Expected: PASS.
  - Kiểm thêm trong `ChapterPage.test.tsx`: chọn một dòng khi đang dirty → hộp hỏi lại hiện ra (Review Focus 2).
- [ ] **Step 5: Commit**

  `git commit -m "feat(novel): jump to any chapter from the chapter page"`

### Task 8: Footer, tài liệu, kiểm tra toàn bộ, PR

**Files:**
- Modify: `frontend/src/components/SiteFooter.tsx:22`, `frontend/src/PublicApp.test.tsx:94`
- Modify: `PROGRESS.md`, `CLAUDE.md` (mục Novels: export một chương, `ChapterJump`, `StatusBadges compact`, crumb tab)

- [ ] **Step 1: Sửa test footer** thành `Vietsub & bản dịch bởi @byZenQN · Mọi video và truyện thuộc quyền sở hữu của tác giả gốc · Cập nhật 2026`. Chạy `npx vitest run src/PublicApp.test.tsx` → FAIL.
- [ ] **Step 2: Sửa câu trong `SiteFooter`** (giữ `{year}`), chạy lại test → PASS.
- [ ] **Step 3: Cập nhật `PROGRESS.md` và `CLAUDE.md`.**
- [ ] **Step 4: Chạy toàn bộ**
  - `mvn test` → BUILD SUCCESS.
  - `cd frontend && npm test` → toàn bộ pass.
  - `cd frontend && npx tsc --noEmit` → không lỗi.
- [ ] **Step 5: Commit, push, mở PR**
  - `git commit -m "docs: novels navigation and export"`
  - `git push -u origin feat/novels-navigation-export`
  - `gh pr create --base main` với mô tả tiếng Anh: tóm tắt, lệnh test và kết quả, ảnh chụp (danh sách chương, menu chương, popover, breadcrumb), link spec + plan.
  - Gửi link PR, **không merge**.
