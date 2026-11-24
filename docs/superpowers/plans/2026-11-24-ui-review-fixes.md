# Plan: sửa lỗi và cải thiện UI sau review 2026-11-24

Spec: `docs/superpowers/specs/2026-11-24-ui-review-fixes-design.md` (mỗi mục B/E có mô tả, file và cách sửa).

## Global Constraints

- Làm tiếp trên nhánh **`fix/chapter-menu-icons`** (PR #71 đã có commit icon menu chương). `git fetch && git checkout
  fix/chapter-menu-icons && git merge origin/main` trước khi bắt đầu (merge commit, không rebase). Một PR duy nhất:
  sửa tiêu đề + mô tả PR #71 ở cuối.
- `data/` có thay đổi chưa commit của user và app thật đang chạy: không stage/stash/revert `data/`, không restart
  Docker, không gọi API ghi vào app thật. Stage file theo đường dẫn, không `git add -A`; không commit
  `frontend/tsconfig.tsbuildinfo`.
- TDD từng mục: test fail trước rồi sửa. Commit nhỏ theo nhóm task, message tiếng Anh, cuối message:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Màu: cam = hành động, tím = đang chọn/đang bật, đỏ = lỗi/xoá. Admin tiếng Anh, public tiếng Việt qua `useT()`.
- Test CSS qua `frontend/src/test/css.ts` như các test hiện có. Vitest có test chập chờn khi máy tải (VietsubPage,
  HomePage, WorkEditPage): chạy lại riêng file đó trước khi kết luận.

## Task 1 — CSS/layout nhỏ: B1, B3, B4, B7, B9, B10, E3
- B1 `ChapterList.css` grid `minmax(0,1fr)`.
- B3 `PublicNovelPage.css` kiểu đang chọn tím + thêm vào `contrast.test.ts`.
- B4 `PublishButton.tsx/.css` tiếng Anh, `--brand-ink`, `--fs-caption`.
- B7 `styles/base.css` `.tabs__list` dưới 760px nowrap + scroll + mask; component tabs dùng chung cuộn tab đang chọn
  vào giữa (`scrollIntoView({inline:'center', block:'nearest'})`).
- B9 trang chương dưới 521px: nhãn một hàng, nút một hàng.
- B10 mọi `accent-color: var(--brand)` → `var(--brand-2-ink)`; test quét toàn bộ CSS.
- E3 `@media (pointer: coarse)` vùng chạm ≥ 44px cho các nút liệt kê trong spec.
- Commit: `fix(ui): mobile overflow, selected colours and touch targets`.

## Task 2 — Trang không tìm thấy: B2, B5, B6
- B2 `ReaderPage.tsx` phân biệt not-found / lỗi mạng; EmptyState + 2 nút; ẩn tiến độ và ‹ ›.
- B5 trang video (admin + public), novel, playlist, work: not-found có PageHeader + breadcrumbs + EmptyState + link;
  playlist id không phải số → not-found, không gọi API.
- B6 `ChapterPage.tsx` sai novel id → `navigate(..., { replace: true })`.
- Commit: `fix(ui): clear not-found pages and chapter URL with the wrong novel`.

## Task 3 — Điều hướng và tiêu đề: E1, E2, E11
- E1 H1 = tên tab, crumb trang con = tên tab trong nhóm Vietsub; liệt kê trong PR.
- E2 hook `useAdminTitle(title, dirty?)` + áp cho các trang chính; `●` khi dirty ở trang chương và editor Vietsub.
- E11 reader dưới 760px ẩn breadcrumb; cập nhật `docs/ui/screen-layout.md` (ngoại lệ).
- Commit: `feat(ui): consistent Vietsub titles and admin tab titles`.

## Task 4 — Trang chương và Novels: B8, E4, E5, E9, E10
- B8 Works: nút hành động nằm trong phần tử `Reveal`.
- E4 ChapterBar ẩn tên khi H1 còn thấy (IntersectionObserver; test mock observer).
- E5 "Show original" chỉ đọc cho chương chữ đã Publish; badge lệch số đoạn.
- E9 banner public lên trên hàng tab.
- E10 NovelCard: skeleton khi chưa tải, "0" khi bằng 0.
- Commit: `feat(ui): chapter page and novels polish`.

## Task 5 — Vietsub: E6, E7, E12, E13, E14
- E6 "Fetched earlier": badge AI/Manual/Done, link Edit Vietsub, SearchBar không dấu (dùng lại helper sẵn có).
- E7 Profiles: EmptyState khi chưa chọn hồ sơ.
- E12 ẩn overlay nút player tới lần `playing` đầu.
- E13 Reopen có chữ.
- E14 cảm ứng: ẩn phím tắt, nút thành "Cỡ chữ" nếu popover chứa chọn cỡ chữ.
- Commit: `feat(ui): Vietsub lists and player polish`.

## Task 6 — Backups: E8 (frontend + backend)
- Frontend: "Backup now" xuống cuối Toolbar; badge khi backup gần nhất > 24h hoặc chưa có (dùng dữ liệu API sẵn có; nếu
  API chưa trả thời điểm backup gần nhất thì thêm trường).
- Backend: sau `ApplicationReady`, nếu cron bật và backup gần nhất > 24h (hoặc không có) → chờ ~2 phút rồi chạy bù một
  lần qua `BackupService.start()` (bỏ qua nếu đang chạy). Test với `Clock` giả và scheduler/executor giả, không sleep thật.
- Commit: `feat(backup): warn about old backups and catch up after a missed day`.

## Finish
- `mvn test -Dskip.npm` (đọc dòng `Tests run:` thật) + toàn bộ vitest + `npx tsc -b`.
- `git diff --numstat origin/main -- src/test frontend/src` không có test bị xoá/viết lại hàng loạt.
- Nếu được: build frontend dev (`npx vite build` hoặc dev server tạm cổng khác 5174, tắt sau khi xong) và chụp 390px /
  1440px các màn hình B1, B2, B5, B7, B9, E1, E8 bằng Edge headless; không chụp được thì ghi rõ trong PR.
- Cập nhật `PROGRESS.md` (mục 2026-11-24) và `CLAUDE.md` nếu có quy ước mới (hook tiêu đề admin, ngoại lệ reader).
- Push; `gh pr edit 71` đổi tiêu đề (vd "UI review fixes: layout, not-found pages, titles, backups") và mô tả tiếng Anh:
  tóm tắt theo mục B/E, test đã chạy + kết quả, link spec/plan, ghi chú mục nào lệch spec. Cuối mô tả:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Không merge, không deploy.
