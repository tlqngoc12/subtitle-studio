# UI review: Get Engsub, Vietsub, Vietsub list và trang xem (admin + public) — Plan

Trạng thái: **user đã duyệt scope 2026-11-10 (W9 Theater mode và cỡ chữ S/M/L để Backlog)**. Nhánh dự kiến `feat/ui-review-watch-lists`, tạo từ `main` **sau khi PR #4 (edit status) merge**. Không tạo PR xếp chồng. PR viết bằng tiếng Anh.

Nguồn review gồm hai phần:
- Đọc code: `HomePage`, `UrlForm`, `ResultPanel`, `CueTable`, `VideoList`, `VietsubStatus`, `VietsubPage`, `VietsubList`, `VietsubListPage`, `PlaylistHeader`, `WatchPage`, `VideoPlayer`, `SubtitleOverlay`, `PlaylistPanel`, `useYouTubePlayer`, `tokens.css`, `base.css`, `vietsub-lists.css`.
- Ảnh chụp app đang chạy (8080), desktop 1366px và mobile 390px. Mobile dùng CDP emulation, đo cả tràn ngang và kích thước vùng chạm.

Admin và public dùng chung `VietsubListPage` và `WatchPage`, nên sửa một chỗ là áp dụng cho cả hai.

## 1. Điểm tốt (giữ nguyên)

- **Hệ màu và token rõ ràng:**
  - Chữ trên nền cam luôn là `--on-brand` tối (khoảng 8:1).
  - Có các token `--brand-ink`/`--brand-2-ink` riêng cho chữ và icon, được `contrast.test.ts` kiểm tra.
  - `--muted` trên `--paper` đạt khoảng 6:1.
  - Dark mode đủ token.
- **Focus ring:**
  - `:focus-visible` dày 3px, màu tím, áp dụng toàn cục.
  - Tiêu đề kết quả nhận focus bằng script khi mở video từ danh sách.
  - `aria-busy` có khi Get Engsub và khi xoá.
- **Chuyển động:** mọi animation tôn trọng `prefers-reduced-motion` (MotionConfig và CSS).
- **Responsive:**
  - Không có tràn ngang thật ở 390px. Thanh menu cuộn ngang là có chủ đích.
  - Ở ≤760px các nút icon lên 44×44, phân trang 44px, tab 44px.
  - Playlist nằm **dưới** video trên mobile, bên phải trên desktop.
- **Phụ đề overlay:**
  - Cỡ chữ theo container (`1.9cqw`, như YouTube).
  - Hộp đen 75%, chữ trắng.
  - Nằm trên thanh điều khiển của YouTube.
  - Vẫn hiện khi toàn màn hình, vì fullscreen áp dụng cho khung bao chứ không phải iframe.
  - iPhone có chế độ "filled" để thay cho Fullscreen API.
- **Playlist panel:**
  - Video đang phát có nền tím, viền trái tím, dấu ▶ và `aria-current`.
  - Panel tự cuộn tới video đang phát.
  - Có Prev/Next kèm phím tắt Shift+P/N, và Autoplay (`role="switch"`).
  - Danh sách cuộn trong khung `max-height: min(70vh, 560px)`, nên playlist hơn 50 tập không đẩy trang dài ra.
- **URL giữ trạng thái:** `?tab`, `?playlist`, `?q`, `?page`. Bấm Back thì quay về đúng chỗ cũ.

## 2. Vấn đề và giải pháp

Mức ưu tiên: **P1** là nên làm (lỗi a11y hoặc UX rõ ràng), **P2** là cải thiện đáng làm, **P3** là tuỳ chọn hoặc để Backlog.

### Trang xem (`/vietsub/:id`, admin + public)

| # | Ưu tiên | Vấn đề | Giải pháp |
|---|---|---|---|
| W1 | P1 | Ở chế độ không có playlist, player rộng hết 1040px nên cao 585px. Cộng thêm phần trên (back link, tiêu đề, kênh) dài khoảng 300px, mép dưới video ở khoảng 885px. **Laptop 1366×768 không thấy trọn video** khi chưa cuộn. | Giới hạn bề rộng player theo chiều cao màn hình: `.player { max-width: calc((100dvh - var(--topbar-h) - 48px) * 16 / 9); margin-inline: auto; }`. Chỉ áp dụng khi không ở fullscreen/filled. |
| W2 | P2 | Tiêu đề và kênh nằm **trên** video, đẩy video xuống. YouTube và các trang xem phim đặt tiêu đề dưới video. | Đổi thứ tự: back link → player (+ panel) → tiêu đề/kênh. Giữ `<h1>` (PageHeader) nhưng đặt sau `.watch`. Đánh giá lại ảnh mobile sau khi đổi. |
| W3 | P2 | **Không có phím tắt điều khiển phát ở cấp trang.** Phím của YouTube chỉ chạy khi focus nằm trong iframe. Hiện chỉ có F (fullscreen) và Shift+N/P. | Thêm vào `useYouTubePlayer` các hàm `togglePlay`, `seekBy`, `toggleMute` (IFrame API có `getPlayerState`, `getCurrentTime`, `seekTo`, `mute/unMute/isMuted`). Bắt phím ở `WatchPage`, bỏ qua khi đang gõ (`isTyping`) và khi có Ctrl/Meta/Alt: **K/Space** phát/dừng, **J/L** lùi/tới 10s, **←/→** lùi/tới 5s, **M** tắt/mở tiếng, **C** ẩn/hiện Vietsub. Space chỉ bắt khi focus không ở trên nút/link. |
| W4 | P2 | Người dùng không biết có phím tắt. | Thêm nút `Keyboard` (lucide) cạnh nút fullscreen, hoặc một dòng chữ nhỏ dưới player, mở popover (Radix, `PopoverPanel` có sẵn) liệt kê phím. Phím `?` cũng mở popover này. |
| W5 | P2 | Không có cách ẩn Vietsub (ví dụ khi muốn xem Engsub của YouTube hoặc xem không phụ đề). | Phím **C** ở W3, kèm nút `Captions`/`CaptionsOff` trong khung player. Lưu lựa chọn vào `localStorage` (try/catch). |
| W6 | P3 | Phụ đề trên điện thoại: player rộng 358px thì `1.9cqw` ra khoảng 6.8px, bị kẹp lên min 12px, hơi nhỏ khi xem dọc. | Tăng mức tối thiểu lên 14px: `clamp(14px, 1.9cqw, 40px)`. Tuỳ chọn: thêm cỡ chữ Nhỏ/Vừa/Lớn trong popover W4 (hệ số 1 / 1.25 / 1.5, lưu localStorage). |
| W7 | P3 | Nút fullscreen 40×40 và mờ 60%. Trên mobile nhỏ hơn 44px. | Ở ≤760px dùng 44×44. Đổi `title` sang `<Tip>` cho thống nhất (Tip vẫn hoạt động khi fullscreen vì portal nằm trong khung? → **cần kiểm tra**; nếu không thì giữ `title`). |
| W8 | P3 | Trang xem có playlist trên mobile tràn ngang 1px (`scrollWidth` 391 so với 390). | Tìm phần tử gây tràn (nghi do `.plpanel` hoặc border) và sửa. |
| W9 | P3 | Theater mode: hiện chưa có. Trên desktop, player ở chế độ playlist chỉ rộng khoảng 684px. | Nút `RectangleHorizontal` hoặc phím **T**: `.watch--theater` cho player rộng hết `.page`, panel xuống dưới (giống layout mobile). Lưu localStorage. **Đề xuất để Backlog** nếu user không cần. |

**Không làm:** tự vẽ thanh điều khiển (Play/Volume/Speed/Settings). Các nút này là của YouTube trong iframe cross-origin, không đổi style được. Tự làm lại cả bộ điều khiển là việc lớn và dễ lỗi trên iOS. Thay vào đó, phím tắt ở W3 bù cho phần bàn phím.

### Playlist panel (trang xem) và thẻ playlist (Vietsub list)

| # | Ưu tiên | Vấn đề | Giải pháp |
|---|---|---|---|
| P1 | P2 | Không phân biệt **video đã xem** với video chưa xem. | Lưu id đã xem vào localStorage, theo mẫu `data/novelReads.ts`. Một video tính là đã xem khi chạy hết (`ended`) hoặc qua 90% thời lượng. Trong panel và danh sách video của playlist: icon `CircleCheck` nhỏ màu `--brand-ink` cạnh số thứ tự, kèm `visually-hidden` "Watched", và thumbnail mờ nhẹ (`opacity: .75`). |
| P2 | P2 | Không thấy "video tiếp theo" khi Autoplay bật. | Dưới vị trí `1 / N` ở đầu panel thêm dòng `Up next: <tiêu đề>` (1 dòng, ellipsis). Video kế trong danh sách có nhãn `Next` nhỏ. |
| P3 | P2 | Thẻ playlist trên mobile **rất cao** (300–400px mỗi thẻ). Ảnh bìa nhỏ 120px nằm cạnh tên. Danh sách 3 tập đầu bị thụt lề (`padding-left: 1.4em` nhưng không có số), nút Play all to. | Ở ≤520px: ảnh bìa rộng hết thẻ nằm trên, ẩn danh sách preview (đã có số video), đặt Play all và số video trên cùng một hàng. Ở mọi khổ: `.plcard__preview { padding-left: 0 }` để thẳng hàng với tên. |
| P4 | P3 | Playlist hơn 50 tập: panel đã cuộn được. Danh sách trong `?playlist=` phân trang 10 video/trang, nên tập 37 nằm ở trang 4, khó tìm. | Hiện số tập (đã có `vlist__index`). Thêm "Go to current/next unwatched" (kết hợp với P1): link "Continue: EP N" ở header playlist dẫn tới video chưa xem đầu tiên. |

### Get Engsub (`/`, admin)

| # | Ưu tiên | Vấn đề | Giải pháp |
|---|---|---|---|
| E1 | P2 | Mobile: mỗi dòng "Fetched earlier" cao khoảng 156px vì hàng nút tách riêng bên dưới, nên 10 video thành khoảng 1600px. Áp dụng cho cả Manage Vietsub (4 nút). | Ở ≤760px: đặt `.history__actions` vào cột chữ, dưới dòng meta, căn trái và thẳng hàng với tiêu đề, thay vì một hàng riêng có thumbnail bên trái để trống. Dùng grid `thumb | text` với actions ở hàng 2 cột 2. Ước tính giảm khoảng 30% chiều cao. |
| E2 | P2 | Nút **Delete** (đỏ) chỉ cách Download 8px. Bấm nhầm trên mobile có hộp xác nhận nhưng vẫn gây khó chịu. | Tách nút nguy hiểm ra: `.button--danger` trong `.history__actions` có `margin-left: var(--space-4)`. |
| E3 | P2 | Desktop: `.history__title` một dòng với ellipsis. Tiêu đề Thái dài bị cắt mà không có cách xem đủ. | Dùng `title-clamp` (2 dòng) ở mọi khổ cho `VideoList`/`VietsubList`, hoặc thêm thuộc tính `title`. Đề xuất 2 dòng để nhất quán với public. |
| E4 | P3 | Bảng xem trước câu (`CueTable`) `max-height: 460px` cuộn bên trong trang. Trên mobile bị cuộn lồng nhau. | Ở ≤760px dùng `max-height: 60dvh`. |
| E5 | P3 | Placeholder trong khung tối `rgb(255 255 255 / .45)` chỉ đạt khoảng 4.3:1, sát ngưỡng. | Đổi lên `.55` (khoảng 5.5:1). |

### Vietsub (`/vietsub`, admin)

| # | Ưu tiên | Vấn đề | Giải pháp |
|---|---|---|---|
| V1 | **P1** | **Nút Replace Vietsub không có focus ring khi dùng bàn phím.** `input[type=file]` có class `visually-hidden` (1×1) nằm trong `label.button`, nên khi Tab tới thì không thấy focus ở đâu. | `label.button:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: 2px; }`. Có thể dùng `:focus-within` làm phương án dự phòng. Viết test kiểm tra CSS (`test/css.ts`). |
| V2 | P3 | Tiêu đề lặp: h1 "Vietsub" rồi h2 "Manage Vietsub" ngay dưới tab "Videos". | Bỏ h2 hiển thị (giữ dạng `visually-hidden` cho cấu trúc heading). |
| V3 | P3 | Cả dòng là link mở editor nhưng không có dấu hiệu gì, nhất là trên mobile (không có hover). | Thêm icon `ChevronRight` mờ ở cuối vùng link, hoặc nút `Pencil` "Edit Vietsub" trong actions. |
| — | — | E1, E2, E3 cũng áp dụng cho trang này. | — |

### Vietsub list (`/vietsub/list`, admin + public)

| # | Ưu tiên | Vấn đề | Giải pháp |
|---|---|---|---|
| L1 | P3 | Desktop: ô tìm kiếm rộng 1040px, quá dài so với nội dung cần nhập. | `max-width: 560px`. |
| — | — | P3 (thẻ playlist) và P1/P4 (đã xem, tiếp tục xem) thuộc trang này. | — |

## 3. Scope đề xuất (chờ user xác nhận)

| Menu | Route | Nội dung sửa |
|---|---|---|
| Vietsub list → xem video | `/vietsub/:id` (admin + public) | W1 video vừa màn hình laptop; W2 tiêu đề dưới video; W3–W5 phím tắt + popover phím + ẩn/hiện Vietsub; W6 phụ đề tối thiểu 14px; W7 nút fullscreen 44px; W8 sửa tràn 1px |
| Vietsub list → xem video (playlist) | `/vietsub/:id?playlist=` | P1 đánh dấu đã xem; P2 "Up next" |
| Vietsub list | `/vietsub/list`, `?playlist=` | P3 thẻ playlist gọn trên mobile + preview thẳng hàng; P4 "Continue: EP N"; L1 ô tìm kiếm 560px |
| Get Engsub | `/` | E1 hàng nút gọn trên mobile; E2 tách nút Delete; E3 tiêu đề 2 dòng; E4 bảng câu 60dvh; E5 placeholder rõ hơn |
| Vietsub | `/vietsub` | V1 focus ring nút Replace; V2 bỏ h2 lặp; V3 dấu hiệu mở editor; E1–E3 |
| — | — | **Backlog:** W9 Theater mode; cỡ chữ phụ đề S/M/L (phần tuỳ chọn của W6) |

## 4. Cách làm (sau khi user duyệt)

- Giao Sonnet làm toàn bộ trên một nhánh. Commit theo nhóm: watch page / playlist / lists / a11y.
- TDD cho phần có logic:
  - phím tắt (bỏ qua khi đang gõ, khi có modifier);
  - lưu "đã xem" (ended / 90%, localStorage hỏng vẫn chạy);
  - "Up next";
  - "Continue".
- Test CSS cho V1 và cho breakpoint (`scripts/check-css-split.mjs` chỉ cho 520/760/1024).
- Chỉ dùng màu cam/tím, đỏ chỉ cho Delete. Icon lucide. Tooltip dùng `<Tip>`, popover dùng `PopoverPanel`.
- Chạy `npm test` và `tsc`. Chụp ảnh lại desktop 1366 + mobile 390 (CDP) để so trước/sau, đính kèm PR.
- Cập nhật `PROGRESS.md` (tiếng Việt) và `CLAUDE.md` (phím tắt trang xem, quy ước "đã xem"). Public cần Publish lại sau khi deploy.
- Review toàn nhánh một lần ở cuối, rồi tạo PR và chờ user duyệt.
