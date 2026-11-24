# Sửa lỗi và cải thiện UI sau đợt review 2026-11-24

Ngày: 2026-11-24 · Trạng thái: đã duyệt 2026-11-24

## Nguồn

Agent review UI (chỉ đọc) chạy trên admin `localhost:8080` và site public, 3 khổ 1440/1280/390, sáng/tối. Ảnh chụp
nằm trong scratchpad của phiên (không bền), nên mỗi mục dưới đây ghi đủ màn hình + file để người làm tự tái hiện.
User chọn làm **toàn bộ mục B (lỗi) và E (cải thiện)**. Tính năng mới F1–F8 để spec riêng.

## Nguyên tắc chung

- Theo `docs/ui/screen-layout.md` và quy tắc màu: cam `--brand` = hành động, tím `--brand-2` = đang chọn/đang bật,
  đỏ chỉ cho lỗi/xoá. Không đổi bảng màu.
- Admin tiếng Anh, public tiếng Việt (`useT()`).
- Sửa component dùng chung thì mọi trang dùng nó đổi theo (đúng ý user).
- Mỗi mục có test (vitest; test CSS qua `src/test/css.ts` như các test hiện có) trừ khi ghi rõ là không test được.
- Breakpoint 520/760/1024, mobile-first.

## 🐞 Lỗi

**B1. Trang truyện admin tràn ngang trên điện thoại** (`/novels/<id>`, tên chương dài). `ChapterList.css`:
`.chapter-list` là grid không khai báo cột nên cột nở theo min-content, ellipsis không chạy. Sửa:
`grid-template-columns: minmax(0, 1fr)` (và `min-width: 0` cho item nếu cần). Test: CSS có khai báo này; trang
390px không còn rộng hơn viewport với tên chương 200 ký tự (nếu test DOM đo được, không thì chỉ test CSS).

**B2. Reader public: chương chưa đăng/không có báo "Không tải được"**. `ReaderPage.tsx` (~dòng 131) bắt mọi lỗi
thành `failed`. Sửa: phân biệt not-found (404 / `CHAPTER_NOT_FOUND`) với lỗi mạng. Not-found → `EmptyState`
"Chương này chưa được đăng" + nút "Về trang truyện" và (nếu truyện có chương) "Đọc chương đầu tiên"; ẩn thanh
tiến độ và nút ‹ ›; có H1. Lỗi mạng giữ câu cũ.

**B3. Nút "Tủ sách" khi bật dùng chữ cam** (`PublicNovelPage.css` ~128–131, `aria-pressed=true`). Đổi sang kiểu
"đang chọn" chuẩn: nền `--brand-2`, chữ/icon `--on-brand`, viền `--brand-2-ink`. Thêm selector vào `contrast.test.ts`.

**B4. Cảnh báo giới hạn file của Publish** (`PublishButton.tsx/.css`): câu tiếng Việt trong admin → tiếng Anh; chữ
`--brand` → `--brand-ink`; cỡ chữ viết tay → `--fs-caption`.

**B5. Trang "không tìm thấy" của video/novel/playlist/work**. Admin và public `/vietsub/<id sai>`: không H1,
breadcrumb "…", admin báo nhầm "no longer in the list… Reload". Novel/Playlist sai id chỉ có H1 chung chung. Sửa:
khi API trả 404 → `PageHeader` với H1 "Video not found" / "Không tìm thấy video" (tương tự Novel, Playlist, Work),
breadcrumbs tới trang danh sách, `EmptyState` + link về danh sách. Câu "no longer in the list… Reload" chỉ dùng khi
video thật sự vừa bị xoá trong phiên (nếu phân biệt được; không thì bỏ câu này). Kèm Backlog: `:playlistId` không
phải số (`/api/playlists/NaN` → 400) → coi như not found ở frontend, không gọi API.

**B6. Trang chương bỏ qua id truyện trong URL** (`/novels/<A>/chapters/<x>` mở chương của truyện B).
`ChapterPage.tsx`: khi `chapter.novelId !== params.id` → `navigate` sang URL đúng với `replace: true`.

**B7. Hàng tab xuống 2 dòng trên điện thoại** (`styles/base.css` `.tabs__list { flex-wrap: wrap }`). Dưới 760px:
`nowrap` + `overflow-x: auto` + mask mờ hai mép (như NavBar) + tab đang chọn tự cuộn vào giữa khi đổi tab.

**B8. Works: nút bút chì hiện trước thẻ** (Reveal). Đặt nút hành động bên trong phần tử được `Reveal` animate.

**B9. Trang chương trên điện thoại: nhãn "Chapter text" gãy dòng, 2 nút xếp chồng**. Dưới 521px: nhãn một hàng
riêng, các nút một hàng bên dưới (wrap gọn, không gãy chữ nhãn).

**B10. Checkbox đang bật màu cam** (`PlaylistPanel.css` ~62, `SaveToPlaylist.css` ~40, và mọi `accent-color:
var(--brand)` khác). Đổi sang `--brand-2-ink` theo quy tắc "đang bật = tím". Test: không còn
`accent-color: var(--brand)` trong CSS.

## ✨ Cải thiện

**E1. Tên tab = H1 = crumb giữa trong nhóm Vietsub**. Hiện: tab "Videos/Playlists/Profiles" đều có H1 "Vietsub",
tab "List" có H1 "Vietsub list"; editor có crumb "Manage Vietsub" trong khi tab tên "Videos"; trang xem thiếu crumb
gốc "Vietsub". Sửa: H1 của mỗi tab = tên tab; crumb của trang con dùng đúng tên tab ("Vietsub › Videos › <video>",
"Vietsub › List › <video>"). Người làm liệt kê đủ các tab/trang con của nhóm Vietsub trong PR. Test các H1/crumb.

**E2. Tiêu đề tab trình duyệt cho admin**. Hook dùng chung (vd `useAdminTitle(title, dirty?)`): `"<tên trang> ·
Subtitle Studio"`, thêm `"● "` ở đầu khi có thay đổi chưa lưu (trang chương, editor Vietsub, form có dirty state sẵn).
Áp cho các trang chính (danh sách, trang truyện, trang chương "Ch. N · <truyện>", editor Vietsub, Works, Photos,
Profiles, Settings). Public giữ cơ chế hiện tại.

**E3. Vùng chạm ≥ 44px trên màn hình cảm ứng**. Dùng lại cách đã có: `@media (pointer: coarse)` + `::after` vô hình
mở rộng vùng chạm, nút vẫn nhìn 32/40px. Áp cho: nút icon trên từng dòng (Videos, Playlists, trang truyện), nav pill,
nút Publish, chấm FilmStrip, ‹ › playlist public. Test CSS.

**E4. Trang chương lặp tên 2 lần** (H1 và ChapterBar). ChapterBar chỉ hiện tên chương khi H1 đã cuộn khỏi màn hình
(IntersectionObserver); khi H1 còn thấy thì ẩn tên trong bar.

**E5. Chương đã Publish xem bản gốc + cảnh báo lệch số đoạn**.
- Chương có bản gốc dạng chữ (Wattpad) đã Publish: thêm nút "Show original" (toggle) hiện cột Original **chỉ đọc**
  như lúc Draft. Mặc định ẩn như hiện nay.
- Dòng "N/M paragraphs of the original": khi N ≠ M hiện badge cảnh báo ("+9 paragraphs" / "−3 paragraphs") màu
  warning có sẵn (không đỏ), thay cho chữ xám. Không làm nút nhảy tới đoạn lệch.

**E6. Get Engsub › "Fetched earlier"**: mỗi dòng có badge Vietsub (AI / Manual, và Done nếu đã Done), link "Edit
Vietsub" khi có Vietsub, và `SearchBar` lọc theo tên (không dấu, như các danh sách khác). Kèm Backlog: lọc tab Videos
theo In progress/Done nếu dùng chung được component lọc.

**E7. Tab Vietsub › Profiles khi chưa chọn hồ sơ**: `EmptyState` giải thích ngắn (chọn hồ sơ để xem các câu đã sửa và
Analyze). Không thêm số liệu vào select.

**E8. Settings › Backups**:
- Dời "Backup now" từ header xuống cuối Toolbar của tab (§2 screen-layout).
- Badge cảnh báo khi backup gần nhất cũ hơn 24 giờ (hoặc chưa có), kèm thời điểm backup gần nhất.
- Backend: sau `ApplicationReady`, nếu cron backup đang bật và backup gần nhất cũ hơn 24 giờ (hoặc không có) thì chạy
  bù **một** lần (chờ khoảng 2 phút sau khởi động để Oracle sẵn sàng). Log một dòng. Không chạy bù khi đang có backup
  chạy. Test với clock giả.

**E9. Banner ở trang Novels public**: đặt banner **trên** hàng tab "Truyện dịch | Fanfic | …" để nó thuộc cả trang
Novels, không còn trông như thuộc tab "Truyện dịch". Không lọc banner theo tab (banner là truyện user tự chọn).

**E10. Lượt đọc "–"**: `NovelCard` phân biệt chưa tải (skeleton nhỏ) với 0 (hiện "0"). "–" chỉ còn khi lượt đọc tắt
hoặc lỗi.

**E11. Reader trên điện thoại có 2 nút về trang truyện**: dưới 760px ẩn breadcrumb trong reader (giữ nút ← ở topbar).
Desktop giữ nguyên. Ghi ngoại lệ này vào `docs/ui/screen-layout.md`.

**E12. Nút của player đè lớp phủ YouTube trước khi phát**: ẩn hàng nút overlay cho tới lần `playing` đầu tiên của
video đó.

**E13. Nút "Reopen" trong editor Vietsub chỉ có icon ↺**: thêm chữ "Reopen" cạnh icon (không dời vào menu).

**E14. Nút "Phím tắt" trên điện thoại**: trên `(hover: none) and (pointer: coarse)` ẩn phần phím tắt; nếu popover
đó đang chứa chọn cỡ chữ phụ đề S/M/L thì trên cảm ứng nút đổi thành "Cỡ chữ" chỉ có phần chọn cỡ chữ.

## Ngoài phạm vi

F1–F8 (tính năng mới), đổi bảng màu, đổi kiến trúc trang, dời nút Delete vào menu.

## Kiểm tra

- `mvn test -Dskip.npm` (E8 có backend) và toàn bộ vitest.
- Chụp lại ở 390px và 1440px các màn hình B1, B2, B5, B7, B9, E1, E8 sau khi sửa (Edge headless), đính vào PR
  (hoặc mô tả nếu không gửi ảnh được).
- Làm tiếp trên nhánh `fix/chapter-menu-icons` của PR #71 (icon menu chương), user chọn gộp chung một PR.
