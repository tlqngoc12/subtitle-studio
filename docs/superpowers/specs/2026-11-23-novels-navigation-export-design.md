# Novels: breadcrumb, Export, chuyển chương, dòng chương 1 hàng, footer (Đợt 1)

Ngày: 2026-11-23 · Trạng thái: chờ duyệt · Đợt 2 (lên Google): [2026-11-23-public-site-seo-design.md](2026-11-23-public-site-seo-design.md)

## Mục đích

Mấy chỗ ở mục Novels đang làm việc hằng ngày bị vướng: breadcrumb thiếu một cấp, Export chỉ xuất được cả truyện, muốn từ chương 1 sang chương 10 phải bấm `>` nhiều lần, dòng chương có tên dài thì rớt xuống 2 hàng. Câu footer của trang public thì chỉ nói về video, trong khi site giờ có cả truyện. Đợt này sửa hết những chỗ đó. Không thêm tính năng mới ngoài phạm vi trên.

## Phạm vi

| Menu | Route | Nội dung |
|---|---|---|
| Novels (admin + public) | trang truyện, trang chương, reader, trang tạo mới | Breadcrumb thêm cấp tab |
| Novels › Translated/Originals (admin) | `/novels?tab=…` | Thêm Export cả truyện vào menu ⋯ của thẻ truyện, dưới Add to banner |
| Novels › chương (admin) | `/novels/:id/chapters/:cid` | Publish vào menu ⋯; thêm Export chapter; popover danh sách chương |
| Novels › truyện (admin) | `/novels/:id`, tab Chapters | Dòng chương luôn 1 hàng, badge đổi thành icon |
| Footer public | mọi trang | Sửa câu footer |

## 1. Breadcrumb có cấp tab

Thêm cấp tab ngay sau `Novels`. Crumb này là link về `/novels?tab=translated` hoặc `/novels?tab=originals`. Truyện có `sourceType === 'ORIGINAL'` (admin) hoặc `original === true` (public) thuộc Originals, còn lại thuộc Translated.

| Trang | Breadcrumb mới |
|---|---|
| Admin `NovelPage` | `Novels › Translated › {Tên truyện}` |
| Admin `ChapterPage` | `Novels › Translated › {Tên truyện} › {Chương}` |
| Admin `NovelNewPage` (New novel) | `Novels › Translated › New novel` |
| Admin `NovelNewPage` (New story) | `Novels › Originals › New story` |
| Public `PublicNovelPage` | `Novels › Truyện dịch › {Tên truyện}` |
| Public `ReaderPage` | `Novels › Truyện dịch › {Tên truyện} › {Chương}` |

- **Nhãn của cấp tab** lấy đúng chữ đang hiện trên tab ở site đó: admin là `Translated`/`Originals`, public là `Truyện dịch`/`Sáng tác`. Mục 1 của `docs/ui/screen-layout.md` chỉ quy định crumb đầu (mục menu) phải là tiếng Anh. *(Quyết định của Opus.)*
- **Nguồn nhãn:** dùng chung một chỗ với `NovelsTabs`, không gõ lại chuỗi ở từng trang.
- **`PublicShelfPage` (Tủ sách)** không thuộc tab nào nên giữ nguyên.
- **Điện thoại** vẫn giữ quy tắc chung `← {trang cha}`, trong đó trang cha là crumb ngay trước trang hiện tại.
- Trên trang chương admin, crumb mới cũng đi qua `onNavigate` → `leave()`, để vẫn hỏi lại khi còn chỉnh sửa chưa lưu.

## 2. Export cả truyện vào menu ⋯ trên thẻ truyện (`NovelMenu`)

Menu ⋯ có *Add to banner* là menu ở góc mỗi thẻ truyện trong danh sách `/novels` (tab Translated hoặc Originals), không phải menu của trang chi tiết truyện.

- Thêm mục **Export** (icon `Download`) ngay dưới *Add to banner / Remove from banner*. Mục này gọi `exportNovel` và tải file zip như hiện tại.
- Khi truyện chưa có chương nào (`chapterCount === 0`) thì mục này bị mờ. Trong lúc đang export, chữ đổi thành `Exporting…` và mục bị mờ. Nếu lỗi thì báo bằng toast giống bây giờ.
- **Giữ nguyên nút Export** trên toolbar tab Chapters của trang chi tiết, vì hai nút nằm ở hai trang khác nhau. *(Sửa lại sau khi đọc code: bản trước ghi là bỏ nút này.)*
- Đoạn code lưu blob thành file (tạo link tạm, click, thu hồi URL) tách thành hàm dùng chung `saveBlob(blob, fileName)` trong `lib/download.ts`. Hàm này được dùng ở trang chi tiết, menu thẻ truyện và Export chapter.

## 3. Trang chương: menu ⋯

- **Publish chuyển vào menu ⋯**, nằm ở vị trí đầu tiên, đúng chỗ Unpublish đang đứng. Chương chưa publish thì hiện **Publish**, đã publish thì hiện **Unpublish**. Lý do bị chặn giữ như cũ (đang dịch, đang chạy việc khác, có chỉnh sửa chưa lưu) và hiện ở dạng mục bị mờ kèm tooltip. Nút Publish primary trên `ChapterBar` bị bỏ.
- **Export chapter** (icon `Download`) nằm ngay dưới Publish/Unpublish. Mục này luôn có, kể cả với truyện tự viết.
  - Chương chưa có chữ thì mục bị mờ, tooltip ghi "This chapter has no text yet.".
  - Có chỉnh sửa chưa lưu thì cũng bị mờ, tooltip ghi "Save your changes first.". *(Quyết định của Opus: export đọc dữ liệu đã lưu trên server.)*
- **Thứ tự mục trong menu:** Publish/Unpublish → Export chapter → Translate / Translate again → Reload original → các mục còn lại như hiện tại.

### API mới

`GET /api/chapters/{id}/export` → `application/zip`, có `Content-Disposition` chứa tên file.

- Trong zip có 2 file `.md` và `.html` của chương, cùng định dạng với export cả truyện (`ChapterExportFormat.heading/markdown/html`).
- Tên file trong zip: `fileBase(1, 1, heading)`.
- Tên zip: tên truyện + chương, đặt theo cách `NovelExportService` đang đặt tên zip.
- Chương không có chữ → `NothingToExportException` (giữ mã lỗi như export cả truyện). Không có chương → 404.
- Không bao giờ log nội dung chương.
- Phần logic gom chữ (`ChapterText.of` + sắp trang) tách ra dùng chung với export cả truyện, không chép lại.
- Frontend: `exportChapter(id)` trong `api/novels.ts`, viết theo mẫu `exportNovel` (fallback tên `chapter-<id>.zip`).

## 4. Popover danh sách chương (A1)

```
 [<] [☰ 3 / 42] [>]
      ┌──────────────────────────┐
      │ 🔍 Find a chapter…        │
      │   Chapter 1 · Mở đầu      │
      │ ▌ Chapter 3 · Cơn mưa     │ ← đang ở đây (tím)
      │   Chapter 4 · …           │
      └──────────────────────────┘
```

- **Nút:** nằm giữa `<` và `>` trong `ChapterNav`, gồm icon `List` + chữ `{vị trí} / {tổng}`. Nút luôn hiện, kể cả khi đang ở chương đầu hoặc chương cuối. Tooltip ghi "All chapters".
- **Dữ liệu:** khi mở popover lần đầu thì lấy danh sách chương bằng `getNovel(novelId)`, không cần API mới. Trong lúc tải thì hiện skeleton. Lỗi thì hiện dòng lỗi kèm nút thử lại. Danh sách được giữ trong lúc còn ở trang. Để có `{vị trí} / {tổng}` ngay từ đầu, `ChapterDetail` trả thêm `position` và `chapterCount` (phía server tính sẵn, cùng chỗ đang tính `prevChapterId`/`nextChapterId`).
- **Danh sách:** sắp theo thứ tự hiện tại (`sortOrder`, `chapterNo`). Mỗi dòng hiện `chapterLabel(...)`, dài quá thì cắt bằng `…`, kèm các icon trạng thái thu gọn ở mục 5.
  - Chương đang mở: nền tím `--brand-2`, chữ `#1B2430`, `aria-current="page"`. Mở popover là tự cuộn tới chương này.
  - Popover rộng khoảng 320 px, cao tối đa khoảng 60vh, cuộn được.
- **Tìm kiếm:** ô tìm ở đầu popover, lọc theo số chương hoặc tên (không phân biệt hoa thường và dấu). Gõ `10` thì ra chương 10.
- **Bàn phím:** mở popover thì focus vào ô tìm. `↑`/`↓` để đi giữa các dòng, `Enter` để mở, `Esc` để đóng.
- **Điều hướng:** bấm vào một dòng thì đi qua `leave(e, to)`, giống nút `<` `>`, nên vẫn hỏi lại khi còn chỉnh sửa chưa lưu.
- **Kỹ thuật:** dùng `Popover` + `PopoverPanel` của Radix như `NovelMenu`, không thêm thư viện mới.

## 5. Dòng chương 1 hàng (tab Chapters)

```
[⠿] Chapter 12 · Tên chương rất dài bị cắt…   🌐 ⟳ 🖼12 ⚠2   [↑][↓]
```

- **Bố cục `chapter-list__row`:** một hàng flex, không xuống dòng.
  - `chapter-list__title` co giãn (`min-width: 0`), dài quá thì cắt bằng `text-overflow: ellipsis`. Rê chuột vào tên thì hiện tên đầy đủ (dùng `Tip`).
  - Cụm icon (`chapter-list__meta`) và cụm nút giữ nguyên độ rộng.
  - Trên điện thoại cũng vẫn 1 hàng.
- **`StatusBadges` thêm prop `compact`:** chỉ hiện icon. Mỗi icon có `Tip` và `aria-label` (nội dung giống chữ cũ, ví dụ "Translated by gemini-…"). Không bật `compact` thì vẫn y như cũ: header trang chương vẫn dùng badge chữ.

| Trạng thái | Icon (lucide) | Màu |
|---|---|---|
| Not translated | `CircleDashed` | `--muted` |
| Translating… | `LoaderCircle` (xoay, tôn trọng reduced-motion) | tím |
| Translated | `Languages` | tím |
| Fallback model | `Replace` | tím |
| Failed | `CircleAlert` | đỏ (lỗi) |
| Draft | `FilePen` | `--muted` |
| Published | `Globe` | cam |

- **Số trang:** `Images` + số, màu `--muted`, tooltip ghi "12 pages" hoặc "Wattpad text". Truyện tự viết thì không hiện, giống bây giờ.
- **Cảnh báo trang thiếu:** giữ nguyên (`TriangleAlert` + số).
- **Màu:** tím và cam lấy từ token `--brand-2-ink`/`--brand-ink` (bản đậm cho icon trên nền sáng). Phải qua được `contrast.test.ts` hoặc `brandRoles.test.ts`. Icon không phụ thuộc màu vì mỗi trạng thái có hình riêng.

## 6. Câu footer public (`SiteFooter`)

`Vietsub & bản dịch bởi @byZenQN · Mọi video và truyện thuộc quyền sở hữu của tác giả gốc · Cập nhật {year}`

`{year}` vẫn tính như hiện tại. Cập nhật luôn `PublicApp.test.tsx`.

## Mục tiêu / Không làm / Không được xảy ra

- **Mục tiêu:** 6 thay đổi ở trên, đúng `docs/ui/screen-layout.md` và đúng quy tắc 2 màu.
- **Không làm:** chuyển chương ở Reader public (đã có mục lục riêng); export dạng khác ngoài `.md` + `.html`; đổi badge ở header trang chương.
- **Không được xảy ra:**
  - Nhảy chương hoặc bấm crumb mà mất chỉnh sửa chưa lưu, không có hộp hỏi lại.
  - Có thao tác Publish nào không còn bị chặn đúng lý do như trước.
  - Icon trạng thái chỉ phân biệt được bằng màu.

## Các cách đã cân nhắc

- **Danh sách chương:** (1) popover thả xuống, **đã chọn**: nhẹ, không che vùng soạn thảo, dùng lại được popover sẵn có; (2) ngăn kéo bên cạnh giống mục lục Reader: rộng nhưng che vùng soạn thảo; (3) `select` gốc của trình duyệt: không tìm được và lệch giao diện.
- **Export một chương:** (1) zip `.md` + `.html`, **đã chọn**, đồng bộ với export cả truyện; (2) chỉ một file `.html`.
- **Dòng chương:** biến thể `compact` cho `StatusBadges` thay vì đổi hẳn component, để header trang chương không bị ảnh hưởng.

## Để người làm tự quyết

- Tên CSS class, tách component (`ChapterJump`…), cách cache danh sách trong popover.
- Chi tiết cách bỏ dấu khi tìm.

## Kiểm tra

- **Vitest:**
  - breadcrumb của từng trang (cả Translated lẫn Originals);
  - `NovelMenu` có Export;
  - menu ⋯ ở trang chương (Publish/Unpublish/Export, thứ tự, trạng thái mờ);
  - popover: lọc, bàn phím, chương hiện tại, hỏi lại khi có chỉnh sửa chưa lưu;
  - `StatusBadges compact`;
  - footer.
- **JUnit:** `GET /api/chapters/{id}/export` (zip đúng 2 file, chương rỗng, không tìm thấy chương), `position`/`chapterCount` trong chi tiết chương.
- Cập nhật `PROGRESS.md` và `CLAUDE.md` (mục Novels) khi xong.
