# Novel Reader UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang đọc truyện public dễ đọc trên mobile (chữ ≥ 18px, thao tác bằng ngón cái, 4 nền màu, skeleton, tải trước chương) và trang chủ/chi tiết truyện rõ ràng hơn (danh sách "Mới cập nhật", lưới bìa lớn, CTA dính đáy, tủ sách).

**Architecture:** Backend vẽ mỗi chương thành 3 khổ trang (S/M/L) dạng *chữ đen trên nền trong suốt*; exporter ghi cả 3 khổ vào JSON chương. Frontend chọn khổ theo màn hình + bậc cỡ chữ, tô nền theo theme bằng CSS (nền = `--reader-paper`, ảnh = `filter`/`opacity`), và thêm thanh dưới, vùng chạm, thanh tiến độ cho mobile.

**Tech Stack:** Spring Boot (Java 2D, ImageIO WebP/PNG), React 19 + Vite + TS, Radix Dialog/Popover, lucide-react, Vitest + Testing Library, JUnit 5.

**Spec:** Phần "Thiết kế đã chốt" ngay dưới đây (rút từ buổi review UI/UX ngày 2026-11-10). Bối cảnh cũ: `docs/superpowers/specs/2026-11-05-novels-design.md` mục 7.

---

## Thiết kế đã chốt

### Phạm vi UI (Menu / Route / Nội dung)

| Menu | Route | Nội dung thay đổi |
|---|---|---|
| Truyện (trang chủ public) | `/novels` | Thêm mục **"Tủ sách"** (nếu có truyện đã lưu) dạng danh sách. Mục **"Mới cập nhật"** đổi từ thẻ sang **danh sách** (bìa 56×84, tên, trạng thái, `x/y chương · 2 giờ trước`). Carousel nổi bật giữ nguyên. |
| Tất cả truyện | `/novels/all` | Đổi sang **lưới bìa lớn** 2:3 (mobile 2 cột, desktop `minmax(160px,1fr)`). |
| Chi tiết truyện | `/novels/:slug` | Thêm nút **Tủ sách** (`BookmarkPlus`/`BookmarkCheck`). Trên mobile, nút "Đọc tiếp/Đọc ngay" + nút Tủ sách **dính đáy màn hình**. Không làm "Đánh giá". |
| Trang đọc | `/novels/:slug/:chapterNo` | Desktop: thanh trên như cũ, bảng Cài đặt mới (4 nền + 3 cỡ chữ). Mobile: thanh trên chỉ còn ← và tên, **thanh dưới** (‹ ☰ thanh trượt Aa ›), **chạm vùng giữa** để hiện/ẩn, chạm trên/dưới để cuộn, Cài đặt dạng **bottom sheet**. Cả hai: thanh tiến độ 3px, skeleton, hiệu ứng mờ dần khi đổi chương, tải trước chương sau. |
| Admin `/novels` (NovelsPage) | — | **Không đổi** (vẫn dùng `.novel-grid`/`.novel-card`). |

### Khổ trang (backend)

| key | width × height | margin | Font | Cỡ chữ thật ở màn hình 375px (full-bleed) |
|---|---|---|---|---|
| `s` | 1080 × 4800 | 64 | 44 | ≈ 15px (desktop: luôn dùng khổ này) |
| `m` | 820 × 3645 | 32 | 44 | ≈ 20px (mặc định mobile) |
| `l` | 700 × 3111 | 28 | 44 | ≈ 24px |

Ảnh: `TYPE_INT_ARGB`, nền **trong suốt**, chữ và watermark **đen** (watermark alpha 0.06 như cũ). `NovelRenderer.VERSION` → 5.

**Vì sao trang cao gấp 3 khổ cũ:** gói Free của Cloudflare Pages giới hạn **20.000 file mỗi site**. Trang cao giúp mỗi chương trung bình (~30.000 ký tự) chỉ khoảng 57 file cho cả 3 khổ cộng JSON, tức site chứa được khoảng 330 chương. Không vượt khoảng 5MP mỗi ảnh để Safari trên iOS giải mã mượt. Khi publish: từ **16.000** file thì cảnh báo, vượt **20.000** thì dừng trước khi deploy (Task 11). Hướng mở rộng về sau: chuyển ảnh chương sang R2.

### Theme (frontend)

| theme | `--reader-paper` | `--reader-img-filter` | `--reader-img-opacity` | Màu chữ thực tế | Tương phản |
|---|---|---|---|---|---|
| `light` | `#FAF8F5` | `invert(0)` | `0.88` | ≈ `#1E1E1D` | ≈ 15.7:1 |
| `sepia` | `#F4ECD8` | `invert(0)` | `0.85` | ≈ `#25231F` | ≈ 13.3:1 |
| `dark` | `#16121B` | `invert(1)` | `0.88` | ≈ `#E3E3E4` | ≈ 14.4:1 |
| `oled` | `#000000` | `invert(1)` | `0.72` | ≈ `#B8B8B8` | ≈ 10.6:1 |

`invert(0)` chứ không phải `none`, để ghép được thành `filter: var(--reader-img-filter) blur(24px)` khi copy guard ẩn nội dung.

Theme mặc định: `reader-night` cũ = `on` → `dark`, `off` → `light`. Nếu chưa từng chọn: app đang tối → `dark`, không thì `sepia`.

### Cỡ chữ (frontend)

`ReaderSize = 0 | 1 | 2`, mặc định `1`.
- Mobile (`max-width: 767px`): bậc 0/1/2 = khổ `s`/`m`/`l`, khung đọc **full-bleed** (không có gutter, lề do ảnh lo).
- Desktop: luôn dùng khổ `s`, độ rộng khung đọc `[560, 640, 720]px`.

### Thông số chung

Thanh dưới cao 56px + `env(safe-area-inset-bottom)`. Nút chạm ≥ 44×44px. Thanh tiến độ 3px màu `--brand`. Easing `cubic-bezier(0.2,0,0,1)`. Hiện ra 200ms, ẩn đi 160ms, bottom sheet 240ms, chương mới mờ dần vào 180ms. Tất cả tắt khi `prefers-reduced-motion`. Tải trước chương sau khi đọc tới ≥ 70% chương.

## Global Constraints

- Màu UI chỉ dùng cam `--brand` (#F39A42) và tím `--brand-2` (#D9A1D9). Đỏ chỉ dành cho lỗi/xoá. Chữ trên nền cam dùng `--on-brand`.
- Icon dùng `lucide-react`. Dialog/sheet/popover dùng Radix có sẵn. **Không thêm dependency mới.**
- Chữ hiển thị trên UI bằng tiếng Việt. Comment trong code bằng tiếng Anh, giữ phong cách hiện tại.
- Mọi truy cập `localStorage` đi qua helper `get`/`set` có try/catch trong `readerPrefs.ts`.
- Giữ nguyên các lớp chống copy: `useCopyGuard`, `.reader__shield`, `user-select: none`, ghi chú khi in.
- Chạy toàn bộ `mvn test` (backend) và `cd frontend && npm test` trước khi báo xong mỗi task có đụng tới phần đó.
- Làm trên nhánh `feat/novel-reader-ux`. Commit message kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **JSON chương xuất từ bản cũ, không có `formats`** → trang đọc vẫn hiển thị bằng `images`, coi như khổ `s` 1080×1600. Test: Task 5.
2. **localStorage bị chặn** (chế độ riêng tư) → theme/cỡ chữ mặc định, tủ sách rỗng, không crash, bấm nút tủ sách không lỗi. Test: Task 4 và Task 10.
3. **Chương ngắn hơn một màn hình** → tiến độ = 1, thanh dưới vẫn hiện, tải trước chương sau vẫn chạy. Test: Task 7 và Task 8.
4. **Chạm vào nút/thanh trượt ở thanh dưới hoặc trong sheet Cài đặt** → không bật/tắt menu và không cuộn trang. Chỉ chạm lên vùng nội dung mới tính. Test: Task 7.
5. **Nền tảng có WebP writer nhưng làm mất kênh alpha** → `ImageEncoder.best()` chuyển sang PNG. Test: Task 1.
6. **Site vượt 20.000 file** → publish dừng trước khi deploy với thông báo rõ ràng, thay vì để Cloudflare từ chối giữa chừng. Test: Task 11.

---

### Task 1: Renderer vẽ 3 khổ, nền trong suốt

**Files:**
- Create: `src/main/java/com/subtitlestudio/novel/render/PageFormat.java`
- Modify: `src/main/java/com/subtitlestudio/novel/render/NovelRenderer.java`, `ImageEncoder.java`, `NovelRenderConfig.java`
- Modify: `src/main/java/com/subtitlestudio/config/SubtitleStudioProperties.java` (`Render` chỉ còn `fontSize`), `src/main/resources/application.yml` (bỏ `width`/`height`)
- Test: `src/test/java/com/subtitlestudio/novel/render/NovelRendererTest.java`, `ImageEncoderTest.java`

**Interfaces:**
- Produces:
  - `public record PageFormat(String key, int width, int height, int margin)` với hằng `S = ("s",1080,4800,64)`, `M = ("m",820,3645,32)`, `L = ("l",700,3111,28)`, `List<PageFormat> ALL = List.of(S, M, L)`.
  - `NovelRenderer(int fontSize)`, `List<BufferedImage> render(RenderInput input, PageFormat format)`, `int fontSize()`.
  - `SubtitleStudioProperties.Novel.Render(int fontSize)` (mặc định 44).

- [ ] **Step 1: Viết test lỗi** trong `NovelRendererTest`:
  - `drawsEachFormatAtItsSize`: với mỗi `PageFormat.ALL`, mọi ảnh có `getWidth()==format.width()`, `getHeight()==format.height()`, `getColorModel().hasAlpha()`.
  - `paperIsTransparentAndInkIsBlack`: khổ `M`, pixel (0,0) có alpha 0. Có ít nhất một pixel alpha > 200 với RGB = 0x000000.
  - `inkStaysInsideMargin`: khổ `M`, mọi pixel có alpha > 128 nằm ở `x >= 32 - 2` và `x < 820 - 32 + 2`. Bỏ qua watermark bằng cách chỉ xét alpha > 128.
  - `narrowerFormatNeedsMorePages`: cùng một văn bản dài (~20.000 ký tự), `render(in, L).size() > render(in, S).size()`.
  - `averageChapterStaysUnder60Images`: văn bản 30.000 ký tự (các đoạn ~400 ký tự tiếng Việt có dấu) → tổng số ảnh của cả 3 khổ ≤ 60. Đây là test chặn hạn mức file của Cloudflare Pages.
  - Các test cũ (cùng input ra cùng pixel, nhãn chương, ngắt dòng…) đổi sang API mới, dùng khổ `S`.
- [ ] **Step 2:** `mvn test -Dskip.npm -Dtest=NovelRendererTest`. Kết quả mong đợi: FAIL (biên dịch lỗi vì chưa có `PageFormat`).
- [ ] **Step 3: Cài đặt.**
  - Bỏ `PAPER`, bỏ `fillRect`. Ảnh `TYPE_INT_ARGB`, chữ `Color.BLACK`, lề = `format.margin()`, wrap = `width - 2*margin`, đáy trang = `format.height()`.
  - `VERSION = 5`.
  - `NovelRenderConfig` tạo `new NovelRenderer(properties.novel().render().fontSize())`.
- [ ] **Step 4: Test lỗi cho encoder** trong `ImageEncoderTest`:
  - `keepsAlpha`: `ImageEncoder.best()` encode một ảnh ARGB 4×4 có (0,0) alpha 0, đọc lại bằng `ImageIO.read`, pixel (0,0) phải có alpha 0.
  - `fallsBackToPngWhenWebpDropsAlpha`: tách phần thăm dò thành `static ImageEncoder pick(ImageEncoder webp)` (package-private). Truyền vào một encoder giả trả về PNG đã mất alpha → `pick(...).extension()` là `"png"`.
- [ ] **Step 5: Cài đặt `pick`.** Thăm dò bằng ảnh ARGB 2×2 có pixel trong suốt. Encode, decode lại, kiểm tra alpha. Nếu ném lỗi hoặc mất alpha thì trả về `png()`. `best()` = `pick(webpEncoder)`.
- [ ] **Step 6:** `mvn test -Dskip.npm -Dtest='NovelRendererTest,ImageEncoderTest'`. Kết quả mong đợi: PASS.
- [ ] **Step 7: Commit** `feat(novel): render chapter pages in three formats on transparent paper`

### Task 2: RenderCache lưu nhiều khổ

**Files:**
- Create: `src/main/java/com/subtitlestudio/novel/render/RenderedFormat.java`
- Modify: `src/main/java/com/subtitlestudio/novel/render/RenderCache.java`
- Test: `src/test/java/com/subtitlestudio/novel/render/RenderCacheTest.java`

**Interfaces:**
- Consumes: `PageFormat.ALL`, `NovelRenderer.render(RenderInput, PageFormat)`, `fontSize()` (Task 1).
- Produces:
  - `public record RenderedFormat(PageFormat format, List<Path> files)`.
  - `public synchronized List<RenderedFormat> imagesFor(long chapterId, RenderInput input)`, thứ tự đúng theo `PageFormat.ALL`.

- [ ] **Step 1: Viết test lỗi:**
  - `writesAllThreeFormats`: kết quả có 3 phần tử, key `s`,`m`,`l`, mọi file tồn tại.
  - `secondCallDoesNotRedraw`: mtime các file không đổi sau lần gọi thứ hai (cách kiểm tra giữ như test cũ hiện có).
  - `newTextReplacesAllFormats`: đổi text → file của hash cũ (cả 3 khổ) bị xoá, file của 3 khổ mới còn đủ.
  - `oneMissingFileRedrawsOnlyThatFormat`: xoá 1 file của khổ `m` → gọi lại thì khổ `m` được vẽ lại, mtime file khổ `s` không đổi.
- [ ] **Step 2:** `mvn test -Dskip.npm -Dtest=RenderCacheTest`. Kết quả mong đợi: FAIL.
- [ ] **Step 3: Cài đặt.**
  - Hash của từng khổ gồm: version, đuôi file, `format.key/width/height/margin`, `fontSize` và các trường input như hiện tại.
  - File: `{hash}-{k}.{ext}`, đánh dấu hoàn tất bằng `{hash}.count`.
  - `deleteOthers` giữ lại file bắt đầu bằng **bất kỳ** hash nào trong 3 hash hiện tại.
- [ ] **Step 4:** `mvn test -Dskip.npm -Dtest=RenderCacheTest`. Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(novel): cache every page format of a chapter`

### Task 3: Exporter ghi `formats` vào JSON chương

**Files:**
- Create: `src/main/java/com/subtitlestudio/publish/PublicPageFormat.java`
- Modify: `src/main/java/com/subtitlestudio/publish/NovelExporter.java`, `PublicChapterFile.java`
- Test: `src/test/java/com/subtitlestudio/publish/SiteExporterTest.java`

**Interfaces:**
- Consumes: `RenderCache.imagesFor(...) : List<RenderedFormat>` (Task 2).
- Produces:
  - JSON `data/novels/{slug}/{no}.json` = `{chapterNo, title, label, prev, next, images, formats}`, trong đó `images` = URL của khổ `s` (giữ tương thích cũ).
  - `formats` = `[{key, width, height, images}]` theo thứ tự s, m, l.
  - `public record PublicPageFormat(String key, int width, int height, List<String> images)`.

- [ ] **Step 1: Viết test lỗi** `chapterFileListsEveryFormat`: export 1 chương → JSON có `formats` dài 3, `formats[1].key=="m"`, `formats[1].width==820`, `images` bằng `formats[0].images`, và mọi URL trỏ tới file có thật trong `dir/novels/{slug}/`.
- [ ] **Step 2:** `mvn test -Dskip.npm -Dtest=SiteExporterTest`. Kết quả mong đợi: FAIL.
- [ ] **Step 3: Cài đặt.** `images(...)` copy file của mọi khổ, trả về `List<PublicPageFormat>`. `PublicChapterFile` thêm trường `List<PublicPageFormat> formats`.
- [ ] **Step 4:** Chạy toàn bộ `mvn test -Dskip.npm`. Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(publish): export all chapter page formats`

### Task 4: Kiểu dữ liệu, tuỳ chọn người đọc, tủ sách, cache chương, media query

**Files:**
- Modify: `frontend/src/data/novelTypes.ts`, `frontend/src/data/novelSource.ts`, `frontend/src/PublicApp.tsx`, `frontend/src/pages/public/readerPrefs.ts`
- Create: `frontend/src/lib/useMediaQuery.ts`
- Test: `frontend/src/pages/public/readerPrefs.test.ts`, `frontend/src/data/novelSource.test.ts`, `frontend/src/lib/useMediaQuery.test.tsx`

**Interfaces:**
- Produces:
  - `novelTypes.ts`: `interface PublicPageFormat { key: 's'|'m'|'l'; width: number; height: number; images: string[] }`, và `PublicChapterFile.formats?: PublicPageFormat[]` (comment: "Missing in files published before formats").
  - `readerPrefs.ts`:
    - `type ReaderTheme = 'light'|'sepia'|'dark'|'oled'`, `READER_THEMES: readonly ReaderTheme[]`, `readTheme(): ReaderTheme`, `saveTheme(t)`.
    - `type ReaderSize = 0|1|2`, `readSize(): ReaderSize` (mặc định 1), `saveSize(s)`.
    - `readShelf(): string[]` (slug, mới nhất đứng đầu), `toggleShelf(slug): boolean` (trả về true nếu sau khi bấm truyện nằm trong tủ).
    - **Xoá** `READER_WIDTHS`, `ReaderWidth`, `readWidth`, `saveWidth`, `readNight`, `saveNight`. Giữ nguyên `readProgress`, `readReadChapters`, `recordProgress`, `isDarkTheme`.
  - `novelSource.ts`: `withChapterCache(source: NovelSource): NovelSource`, ghi nhớ promise của `getChapter` theo `${slug}/${no}`, xoá khỏi cache khi promise bị reject. `PublicApp` bọc `createNovelSource()` bằng hàm này.
  - `useMediaQuery.ts`: `COMPACT_QUERY = '(max-width: 767px)'`, `useMediaQuery(query: string): boolean` (lắng nghe sự kiện `change`, try/catch, mặc định false).

- [ ] **Step 1: Viết test lỗi:**
  - `readTheme migrates night on → dark, off → light`.
  - `readTheme defaults to sepia, or dark when the app theme is dark` (đặt `data-theme="dark"`).
  - `readTheme ignores an unknown stored value`.
  - `readSize defaults to 1 and ignores 7`.
  - `toggleShelf adds then removes; newest first`.
  - `blocked storage: defaults and toggleShelf does not throw` (stub `localStorage.getItem/setItem` để ném lỗi).
  - `withChapterCache returns the same promise twice and retries after a rejection`.
  - `useMediaQuery follows change events`.
- [ ] **Step 2:** `cd frontend && npx vitest run src/pages/public/readerPrefs.test.ts src/data/novelSource.test.ts src/lib/useMediaQuery.test.tsx`. Kết quả mong đợi: FAIL.
- [ ] **Step 3:** Cài đặt theo các interface ở trên. Key localStorage: `reader-theme`, `reader-size`, `novel-shelf`.
- [ ] **Step 4:** Chạy lại lệnh trên. Kết quả mong đợi: PASS. `npm test` có thể đỏ ở các file còn dùng API cũ (`ReaderPage`, `ReaderBar`); các task 5–6 sẽ sửa. Ghi lại tên các test đỏ.
- [ ] **Step 5: Commit** `feat(reader): theme, size and shelf preferences, chapter cache`

### Task 5: Trang đọc: chọn khổ trang, theme, khung đọc

**Files:**
- Create: `frontend/src/pages/public/readerLayout.ts`, `frontend/src/pages/public/readerThemes.css`
- Modify: `frontend/src/pages/public/ReaderPage.tsx`, `ReaderPage.css`
- Test: `frontend/src/pages/public/readerLayout.test.ts`, `ReaderPage.test.tsx`

**Interfaces:**
- Consumes: Task 4 (`readTheme`, `readSize`, `useMediaQuery`, `COMPACT_QUERY`, `PublicPageFormat`).
- Produces:
  - `READER_COLUMNS = [560, 640, 720] as const`.
  - `pickFormat(chapter: PublicChapterFile, compact: boolean, size: ReaderSize): PublicPageFormat`.
    - Không có `formats` → `{key:'s', width:1080, height:1600, images: chapter.images}`.
    - `compact` → khổ có key `['s','m','l'][size]`, không có thì khổ `s`.
    - Desktop → khổ `s`.
  - `ReaderPage` giữ state `theme`, `size` và các hàm `changeTheme(t)`, `changeSize(s)` (lưu luôn khi đổi), truyền xuống thanh điều khiển.
  - `<main data-reader-theme={theme}>`. Một effect đặt `document.documentElement.dataset.readerTheme` khi mount và xoá khi unmount.

- [ ] **Step 1: Viết test lỗi:**
  - `readerLayout.test.ts`: `falls back to images as format s when formats is missing`; `compact size 2 picks l`; `desktop always picks s`; `missing m falls back to s`.
  - `ReaderPage.test.tsx`: `renders the m images on a compact screen` (mock `matchMedia` trả true); `sets data-reader-theme from the stored theme`; `img aspect-ratio follows the picked format` (style `aspect-ratio: 820 / 1215`).
- [ ] **Step 2:** `npx vitest run src/pages/public/readerLayout.test.ts src/pages/public/ReaderPage.test.tsx`. Kết quả mong đợi: FAIL.
- [ ] **Step 3: Cài đặt.**
  - `readerThemes.css` chứa 4 khối `[data-reader-theme=…]` với các giá trị trong bảng Theme. Thêm `html[data-reader-theme] body { background: var(--reader-paper) }`.
  - `.reader` có `background: var(--reader-paper)`.
  - `.reader__page` có `filter: var(--reader-img-filter); opacity: var(--reader-img-opacity)`.
  - Khi copy guard ẩn: `filter: var(--reader-img-filter) blur(24px)`. Bỏ class `reader--night`.
  - Desktop: `--reader-width: READER_COLUMNS[size]px`. Mobile: `.reader` full-bleed bằng `margin-inline: calc(-1 * var(--page-gutter))` (dùng token gutter hiện có của `.page`, nếu tên khác thì đọc trong `styles/`).
  - Mỗi `<img>` có `style={{ aspectRatio: \`${w} / ${h}\` }}`.
- [ ] **Step 4:** Chạy lại các test trên. Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(reader): pick page format by screen and size, four paper themes`

### Task 6: Bảng Cài đặt dùng chung (popover trên desktop, bottom sheet trên mobile)

**Files:**
- Create: `frontend/src/pages/public/ReaderSettings.tsx`, `ReaderSettings.css`
- Modify: `frontend/src/pages/public/ReaderBar.tsx`, `ReaderBar.css`
- Test: `frontend/src/pages/public/ReaderSettings.test.tsx`, `ReaderTopbar.test.tsx`

**Interfaces:**
- Consumes: `ReaderTheme`, `ReaderSize`, `READER_THEMES` (Task 4).
- Produces:
  - `ReaderSettingsPanel({ theme, onTheme, size, onSize })`:
    - Nhóm radio "Màu nền" gồm 4 ô tròn 40px. Mỗi ô có nền là màu giấy, chữ "Aa" màu chữ tương ứng, viền chọn `--brand` 2px. Nhãn: Sáng / Giấy / Tối / Đen OLED.
    - Nhóm radio "Cỡ chữ" gồm 3 nút cao 44px, nhãn "A" với 3 cỡ chữ khác nhau, aria-label "Chữ nhỏ" / "Chữ vừa" / "Chữ lớn".
  - `ReaderSettingsSheet({ open, onOpenChange, ...panelProps })`: Radix Dialog có class `sheet`, trượt từ đáy lên, tiêu đề "Hiển thị".
  - Prop mới của `ReaderBar`: `theme`, `onTheme`, `size`, `onSize`. **Bỏ** `night`, `onToggleNight`, `width`, `onStepWidth`. Popover desktop hiển thị `ReaderSettingsPanel`. Việc ẩn/hiện thanh vẫn giữ trong `ReaderBar` ở task này; Task 7 sẽ đưa lên `ReaderPage`.

- [ ] **Step 1: Viết test lỗi:**
  - `picking Tối calls onTheme('dark') and marks it checked`.
  - `arrow keys move between swatches` (hành vi radiogroup).
  - `Chữ lớn calls onSize(2)`.
  - Trong `ReaderTopbar.test.tsx`: thay các test chế độ đêm/độ rộng cũ bằng `settings popover shows the theme and size groups`.
- [ ] **Step 2:** `npx vitest run src/pages/public/ReaderSettings.test.tsx src/pages/public/ReaderTopbar.test.tsx`. Kết quả mong đợi: FAIL.
- [ ] **Step 3: Cài đặt.**
  - Radiogroup viết bằng `<input type="radio">` ẩn bên trong `<label>`, để có sẵn bàn phím và a11y mà không cần thư viện.
  - Sheet: `position: fixed; inset: auto 0 0 0; border-radius: 16px 16px 0 0; padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom))`. Animation `translateY(100%)` 240ms.
  - Gắn `OWN_KEYS` lên popover và sheet.
- [ ] **Step 4:** Chạy lại các test trên. Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(reader): settings panel with paper themes and text sizes`

### Task 7: Điều khiển trên mobile: thanh dưới, vùng chạm, tiến độ

**Files:**
- Create: `frontend/src/lib/useReaderChrome.ts`, `frontend/src/lib/useScrollProgress.ts`, `frontend/src/pages/public/ReaderBottomBar.tsx`, `ReaderBottomBar.css`, `frontend/src/pages/public/ReaderTocDrawer.tsx`
- Modify: `ReaderBar.tsx` (đưa drawer mục lục sang `ReaderTocDrawer`, ẩn nhóm nút bên phải khi `max-width: 767px`), `ReaderPage.tsx`, `ReaderPage.css`
- Test: `frontend/src/lib/useReaderChrome.test.tsx`, `frontend/src/lib/useScrollProgress.test.tsx`, `frontend/src/pages/public/ReaderBottomBar.test.tsx`, `ReaderPage.test.tsx`

**Interfaces:**
- Consumes: `useMediaQuery`/`COMPACT_QUERY` (Task 4), `ReaderSettingsSheet` (Task 6).
- Produces:
  - `useReaderChrome(locked: boolean): { hidden: boolean; toggle(): void; show(): void }`.
    - Cách ẩn/hiện theo hướng cuộn giống `useHideOnScroll` (giữ lại hook cũ cho nơi khác dùng).
    - `toggle()` đảo trạng thái hiện tại. Lần đổi hướng cuộn tiếp theo (vượt TOLERANCE) sẽ ghi đè lại.
    - `locked` → luôn hiện.
  - `useScrollProgress(ref: RefObject<HTMLElement|null>): number` (0..1, cập nhật theo `requestAnimationFrame`).
    - Công thức: `(scrollY - top) / (height - innerHeight)`, kẹp trong [0,1].
    - `height <= innerHeight` → 1.
  - `scrollToProgress(el: HTMLElement, p: number): void`.
  - `ReaderTocDrawer({ open, onOpenChange, slug, chapters, currentNo })`: chuyển nguyên code drawer + `ChapterToc` hiện có sang đây.
  - `ReaderBottomBar({ slug, prev, next, progress, onSeek, onToc, onSettings, hidden, position: {index, total} })`, một hàng 56px:
    - `‹` (Chương trước), `☰` (Mục lục), thanh trượt `input type=range` 0..1000 aria-label "Vị trí trong chương", `Aa` (Hiển thị), `›` (Chương sau).
    - Dưới thanh trượt có chữ nhỏ `{index}/{total}`.
  - `ReaderBar` (đổi prop):
    - Bỏ `useHideOnScroll` bên trong. Nhận thêm `hidden: boolean` (dùng để gọi `setHidden` của topbar), `onPinnedChange(pinned: boolean)` (báo lên khi bàn phím đang focus trong thanh), `tocOpen`/`onTocOpenChange`, `settingsOpen`/`onSettingsOpenChange` (dùng cho popover desktop).
  - `ReaderPage`:
    - `ReaderPage` giữ `tocOpen`, `settingsOpen`, `pinned` và gọi `chrome = useReaderChrome(tocOpen || settingsOpen || pinned)`.
    - Truyền `chrome.hidden` cho `ReaderBar` và `ReaderBottomBar`. Trên mobile, nút Aa mở `ReaderSettingsSheet` cũng bằng `settingsOpen`.
    - Thanh tiến độ `<div class="reader-progress" aria-hidden>` cố định ở top, 3px, `transform: scaleX(progress)`, nằm trên topbar.
    - Khi `progress >= 0.98` thì gọi `chrome.show()`.
  - Vùng chạm (chỉ khi compact): xử lý `onClick` trên `.reader__shield`.
    - `clientY < 25% innerHeight` → cuộn lên `0.9*innerHeight`.
    - `clientY > 75% innerHeight` → cuộn xuống `0.9*innerHeight`.
    - Ở giữa → `chrome.toggle()`.
    - Cuộn mượt (`behavior: 'smooth'`), trừ khi `prefers-reduced-motion`.
    - Không làm gì nếu `event.target` không phải shield.

- [ ] **Step 1: Viết test lỗi:**
  - `useReaderChrome`:
    - `hides on scroll down, shows on toggle, hides again on further scroll down`.
    - `locked keeps it shown`.
  - `useScrollProgress`:
    - `0 at top, 0.5 halfway, 1 at end` (stub `getBoundingClientRect`, `scrollY`, `innerHeight`).
    - `content shorter than the viewport → 1`.
  - `ReaderBottomBar`:
    - `prev/next disabled at ends`.
    - `moving the slider calls onSeek(0.5)`.
    - `☰ calls onToc, Aa calls onSettings`.
    - `has data-hidden when hidden`.
  - `ReaderPage` (compact):
    - `tap in the middle toggles the bars`.
    - `tap in the bottom quarter scrolls down` (spy `window.scrollBy`).
    - `tapping the slider or a bar button does not toggle or scroll`.
    - `bottom bar is not rendered on desktop`.
- [ ] **Step 2:** `npx vitest run src/lib src/pages/public`. Kết quả mong đợi: FAIL ở các test mới.
- [ ] **Step 3: Cài đặt.**
  - Thanh dưới: `position: fixed; inset: auto 0 0 0; height: calc(56px + env(safe-area-inset-bottom))`, nền `--surface`, viền trên `--rule`.
  - Khi `[data-hidden]`: `transform: translateY(100%)`. Hiện ra 200ms `cubic-bezier(0.2,0,0,1)`, ẩn đi 160ms `ease-in`.
  - `.reader-page` trên mobile có `padding-bottom: calc(56px + env(safe-area-inset-bottom) + var(--space-4))`.
  - Topbar trên mobile chỉ còn ← và tên truyện/chương.
- [ ] **Step 4:** `cd frontend && npm test`. Kết quả mong đợi: toàn bộ PASS.
- [ ] **Step 5: Commit** `feat(reader): thumb-zone bottom bar, tap zones and reading progress on mobile`

### Task 8: Skeleton, hiệu ứng đổi chương, tải trước chương sau

**Files:**
- Create: `frontend/src/pages/public/ReaderSkeleton.tsx`, `ReaderSkeleton.css`
- Modify: `ReaderPage.tsx`, `ReaderPage.css`
- Test: `ReaderPage.test.tsx`

**Interfaces:**
- Consumes: `withChapterCache` (Task 4: nhờ cache, gọi `source.getChapter` hai lần không tải lại), `pickFormat` (Task 5), `useScrollProgress` (Task 7).
- Produces:
  - `ReaderSkeleton({ width })`:
    - Một khối `aspect-ratio: 2 / 3` (cỡ một màn hình, không phải chiều cao trang 4800px), rộng bằng khung đọc, nền `--reader-paper`.
    - Bên trong: 1 thanh tiêu đề (cao 20px, rộng 55%) và 9 thanh dòng chữ (cao 12px, cách nhau 22px, rộng xen kẽ 100%/92%, dòng cuối 60%).
    - Màu thanh: `color-mix(in srgb, currentColor 10%, transparent)`, nằm dưới `[data-reader-theme]`.
    - Shimmer 1.2s, tắt khi reduced-motion.
    - Có `aria-hidden`, kèm `<LoadingText className="visually-hidden">Đang tải chương…</LoadingText>` (giữ nguyên chữ cho test cũ).
  - Tiêu đề chương hiển thị ngay khi đang tải, lấy từ `novel.chapters` (`publicChapterLabel`).
  - `.reader` có `key={chapterNo}` và animation `reader-in` 180ms (opacity 0 → 1).
  - Tải trước: lần đầu `progress >= 0.7` và `next !== null` → `source.getChapter(slug, next)`, sau đó `new Image().src = pickFormat(c, compact, size).images[0]`. Mỗi chương chỉ làm một lần (ghi nhớ bằng ref).

- [ ] **Step 1: Viết test lỗi:**
  - `shows the skeleton and the chapter title from the novel while loading`.
  - `prefetches the next chapter once at 70%` (spy `source.getChapter`, đếm số lần gọi = 2: chương hiện tại + chương sau, không gọi lại khi cuộn tiếp).
  - `prefetches at once when the chapter is shorter than the screen`.
  - `no prefetch on the last chapter`.
- [ ] **Step 2:** `npx vitest run src/pages/public/ReaderPage.test.tsx`. Kết quả mong đợi: FAIL.
- [ ] **Step 3:** Cài đặt theo các interface ở trên.
- [ ] **Step 4:** `cd frontend && npm test`. Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(reader): chapter skeleton, fade-in and next-chapter prefetch`

### Task 9: Trang chủ và Tất cả truyện: danh sách, lưới bìa lớn, tủ sách

**Files:**
- Create: `frontend/src/pages/public/NovelRow.tsx`, `NovelRow.css`, `frontend/src/pages/public/NovelTile.tsx`, `NovelTile.css`
- Modify: `publicNames.ts`, `PublicNovelsPage.tsx`, `PublicAllNovelsPage.tsx`
- Test: `publicNames.test.ts`, `PublicNovelsHome.test.tsx`, `NovelRow.test.tsx`

**Interfaces:**
- Consumes: `readShelf`, `readProgress` (Task 4).
- Produces:
  - `relativeTime(iso: string, now?: Date): string`:
    - `< 60s` → "vừa xong".
    - `< 60 phút` → "N phút trước".
    - `< 24 giờ` → "N giờ trước".
    - `< 30 ngày` → "N ngày trước".
    - Từ 30 ngày trở lên → `publicDate(iso)`.
  - `NovelRow({ novel, continueNo?: number | null })`, render ra `<li>`:
    - Bìa 56×84, tên truyện (tối đa 2 dòng), badge trạng thái, meta `${publicChapterProgress(n)} chương · ${relativeTime(lastPublishedAt ?? updatedAt)}`.
    - Có `continueNo` thì thêm dòng "Đọc tiếp: Chương N", dẫn tới `/novels/{slug}/{N}`.
    - Danh sách: `<ul class="novel-rows">`, mỗi dòng ngăn cách bằng viền `--rule`, cả dòng là một link cao ≥ 44px.
  - `NovelTile({ novel })`, render ra `<li>`:
    - Bìa 2:3 rộng 100%, bo `--radius-frame`, tên truyện (tối đa 2 dòng), meta `x/y chương`.
    - Lưới `.novel-tiles`: `repeat(2, minmax(0,1fr))` khi `<640px`, `repeat(auto-fill, minmax(160px,1fr))` từ 640px trở lên, gap `var(--space-4)`.
  - Trang chủ: carousel nổi bật → **"Tủ sách"** (chỉ hiện khi có truyện đã lưu; `NovelRow` kèm `continueNo = readProgress(slug)`) → **"Mới cập nhật"** (`NovelRow`, 6 truyện) → link "Xem tất cả".
  - `/novels/all` dùng `NovelTile`. `NovelCard` và `.novel-grid` giữ nguyên cho trang admin.

- [ ] **Step 1: Viết test lỗi:**
  - `relativeTime`: 30s → "vừa xong"; 5 phút; 3 giờ; 2 ngày; 40 ngày → `publicDate`.
  - `NovelRow shows the continue link when continueNo is given`.
  - Trang chủ: `shows Tủ sách only with shelved novels`; `Mới cập nhật renders rows with relative time`.
- [ ] **Step 2:** `npx vitest run src/pages/public`. Kết quả mong đợi: FAIL.
- [ ] **Step 3:** Cài đặt theo các interface ở trên.
- [ ] **Step 4:** `cd frontend && npm test`. Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(novels): shelf and latest updates as rows, cover grid for all novels`

### Task 10: Trang chi tiết: nút Tủ sách và CTA dính đáy trên mobile

**Files:**
- Modify: `frontend/src/pages/public/PublicNovelPage.tsx`, `PublicNovelPage.css`
- Test: `frontend/src/pages/public/PublicNovelPage.test.tsx`

**Interfaces:**
- Consumes: `toggleShelf`, `readShelf` (Task 4).
- Produces:
  - Nút `IconButton`/button có `aria-pressed`, nhãn "Thêm vào tủ sách" / "Đã lưu vào tủ sách", icon `BookmarkPlus` / `BookmarkCheck`. Bấm thì hiện toast sonner "Đã thêm vào tủ sách" / "Đã bỏ khỏi tủ sách".
  - Nhóm CTA `.novel-cta`:
    - Desktop: nằm trong hero như hiện tại.
    - `<768px`: `position: sticky; bottom: 0`, nền `--surface`, viền trên `--rule`, `padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom))`.
    - Nút chính rộng `1fr`, cao 48px. Nút tủ sách 48×48. "Đọc từ đầu" và "Nguồn" vẫn nằm trong hero.

- [ ] **Step 1: Viết test lỗi:**
  - `shelf button toggles aria-pressed and persists across remount`.
  - `shelf button works with blocked storage` (không ném lỗi, `aria-pressed` vẫn đổi trong phiên).
- [ ] **Step 2:** `npx vitest run src/pages/public/PublicNovelPage.test.tsx`. Kết quả mong đợi: FAIL.
- [ ] **Step 3:** Cài đặt. Trạng thái tủ sách giữ trong state, khởi tạo từ `readShelf().includes(slug)`.
- [ ] **Step 4:** `cd frontend && npm test`. Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(novels): shelf button and sticky read CTA on mobile`

### Task 11: Đếm file khi publish, cảnh báo và chặn

**Files:**
- Modify: `src/main/java/com/subtitlestudio/publish/PublishService.java`, `PublishStatus.java`
- Modify: `frontend/src/api/publish.ts`, `frontend/src/components/PublishButton.tsx`
- Test: `src/test/java/com/subtitlestudio/publish/PublishServiceTest.java`, `frontend/src/components/PublishButton.test.tsx` (tạo mới nếu chưa có)

**Interfaces:**
- Produces:
  - `PublishService.FILE_LIMIT = 20_000`, `PublishService.FILE_WARNING = 16_000`.
  - `PublishStatus` thêm trường cuối `Integer fileCount` (số file thường trong thư mục site của lần publish gần nhất; null nếu chưa publish lần nào).
  - Trong `run()`: sau `readCounts.prepare(dir)` thì đếm file.
    - Vượt `FILE_LIMIT` → `FAILED` với `error` = "Site has N files, over the 20,000 file limit of Cloudflare Pages (Free plan)." và **không** gọi `wrangler.deploy`.
    - Không vượt → deploy như cũ.
    - Cả hai trường hợp đều lưu `fileCount`.
  - Frontend: kiểu `PublishStatus.fileCount?: number | null`. `PublishButton` hiển thị:
    - Khi `fileCount >= 16000`: dòng cảnh báo màu cam (dùng `--brand`, không dùng đỏ) "Site đang có {n}/20.000 file (giới hạn Cloudflare Free). Sắp đầy, nên tính chuyển ảnh chương sang R2."
    - Khi publish thất bại vì vượt giới hạn: lỗi dùng kiểu lỗi hiện có.

- [ ] **Step 1: Viết test lỗi:**
  - `PublishServiceTest`:
    - `stopsBeforeDeployOverTheFileLimit`: exporter giả ghi 20.001 file rỗng → status FAILED, `FakeWrangler` không được gọi, `fileCount == 20001`.
    - `recordsTheFileCountOnSuccess`.
  - `PublishButton.test.tsx`:
    - `warns at 16000 files`.
    - `no warning at 15999`.
- [ ] **Step 2:** `mvn test -Dskip.npm -Dtest=PublishServiceTest` và `npx vitest run src/components/PublishButton.test.tsx`. Kết quả mong đợi: FAIL.
- [ ] **Step 3:** Cài đặt. Đếm bằng `Files.walk(dir).filter(Files::isRegularFile).count()`.
- [ ] **Step 4:** Chạy lại 2 lệnh trên. Kết quả mong đợi: PASS.
- [ ] **Step 5: Commit** `feat(publish): count site files, warn near and stop over the Pages limit`

### Task 12: Kiểm tra cuối và tài liệu

**Files:**
- Modify: `PROGRESS.md`, `CLAUDE.md` (mục Novels/public reader: 3 khổ trang, ảnh nền trong suốt, theme bằng CSS, key localStorage mới)

- [ ] **Step 1:** `mvn test` (gồm cả frontend). Kết quả mong đợi: BUILD SUCCESS.
- [ ] **Step 2:** `cd frontend && npm run build && npm run build:public`. Kết quả mong đợi: build thành công, không có lỗi TS.
- [ ] **Step 3:** Chạy app, publish thử 1 truyện, mở trang public bằng Playwright ở 375×812 và 1280×800. Chụp màn hình 4 theme ở mobile, thanh dưới, bottom sheet, skeleton (chặn mạng để thấy). Kiểm tra ảnh mới có nền trong suốt và đủ 3 khổ trong `data/novels/{slug}/{no}.json`.
- [ ] **Step 4:** Cập nhật `PROGRESS.md` và `CLAUDE.md`. Commit `docs: novel reader UX`.
