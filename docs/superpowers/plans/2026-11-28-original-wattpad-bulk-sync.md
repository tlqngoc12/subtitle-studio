# Plan: Truyện sáng tác: Sync with Wattpad cho cả truyện

Spec: [docs/superpowers/specs/2026-11-28-original-wattpad-bulk-sync-design.md](../specs/2026-11-28-original-wattpad-bulk-sync-design.md). Nhánh: `feat/original-wattpad-bulk-sync`, một PR.

Mỗi task: viết test trước, rồi code, chạy test, commit riêng (message tiếng Anh). Lệnh test:
- Backend: `mvn -q test` (dùng `-Dtest=...` khi đang làm, chạy đủ ở cuối).
- Frontend: `cd frontend && npx vitest run && npx tsc --noEmit -p .`.

Test không gọi Wattpad thật: stub `WattpadClient` như `WattpadNovelServiceTest`.

## T1. Migration V31 và entity
- Thêm `src/main/resources/db/migration/V31__chapter_original_wattpad_link.sql`:
  - `t_chapter.original_wattpad_part_id VARCHAR2(20 CHAR)` với ràng buộc UNIQUE `t_chapter_orig_wattpad_part_uk`.
  - `t_chapter.wattpad_synced_hash CHAR(64)`.
  - `t_chapter.wattpad_modified_at TIMESTAMP` (cùng kiểu với `source_fetched_at`).
  - Kiểm tra migration chạy được trên H2 `MODE=Oracle` (test) và theo cú pháp Oracle (theo mẫu V20).
- `Chapter`: thêm hai field, getter và setter.
- Thêm hàm thuần `ChapterSyncHash.of(String text)`: SHA-256 hex chữ thường; text null cho cùng kết quả với chuỗi rỗng. Có test.

## T2. Sync tay từng chương ghi id phần và hash
- `ChapterService.replaceOriginalText(chapterId, text, partId)`:
  - Ghi `original_wattpad_part_id`. Nếu id phần đang gắn với chương khác của truyện thì gỡ khỏi chương kia trước, trong cùng transaction.
  - Ghi `wattpad_synced_hash = ChapterSyncHash.of(text_vi đã lưu)`.
  - Ghi `wattpad_modified_at` = `modifiedAt` của phần (tham số thêm; null nếu Wattpad không trả).
  - Vẫn ghi `source_fetched_at` như hiện nay.
- `WattpadNovelService.syncOriginal` truyền `partId` và `part.modifiedAt()` vào.
- `ChapterDetail` thêm `originalWattpadPartId` (frontend dùng để chọn sẵn và hiện nhãn "Linked").
- Test: ghi id và hash; chuyển id phần từ chương A sang B; lưu tay không đổi hash.

## T3. Tính kế hoạch sync (`sync-plan`)
- Thêm `novel.wattpad.OriginalSyncPlanner`, hàm thuần, không gọi I/O.
  - Vào: danh sách phần Wattpad + danh sách chương (id, tiêu đề, thứ tự đọc, trạng thái publish, `original_wattpad_part_id`, `source_fetched_at`, hash đã lưu, hash chữ hiện tại).
  - Ra: danh sách `SyncPlanItem` theo đúng luật ghép (id trước, tên sau, chương đứng trước thắng) và đúng thứ tự trạng thái trong spec, cùng số `upToDate`.
- `WattpadNovelService.syncPlan(novelId)`: kiểm tra truyện ORIGINAL có link, gọi `storyWithParts` một lần, đọc chương (transaction chỉ đọc), rồi gọi planner.
- `NovelController`: `GET /api/novels/{id}/wattpad/sync-plan` trả record `{parts, upToDate}`; mỗi mục có `lastSyncedAt` (`source_fetched_at` của chương đã ghép).
- Test planner kỹ: đủ 7 trạng thái, Wattpad thiếu `modifyDate`, nhiều chương trùng tên, chương đã ghép phần khác không bị ghép theo tên, phần đã ghép bị xoá. Thêm test service cho trường hợp không có link (409).

## T4. Chạy sync cả lô (`POST sync`)
- `WattpadNovelService.syncMany(novelId, items)`:
  - Mỗi truyện chỉ chạy một lô một lúc (khoá trong bộ nhớ theo novelId, giống cách các tác vụ "một lúc một lần" khác của repo). Đang chạy thì 409 `WATTPAD_SYNC_RUNNING`, thêm exception và mapping ProblemDetail.
  - Tính lại kế hoạch (gọi `storyWithParts` một lần). Mục không còn hợp lệ thì đưa vào `failed`.
  - Lần lượt theo thứ tự Wattpad, nghỉ 500 ms giữa hai phần (dùng `Sleeper` sẵn có để test không phải chờ thật).
  - `chapterId` có giá trị → `replaceOriginalText(…, partId)`.
  - `chapterId` null → tạo chương Draft cuối truyện, tiêu đề là tên phần (tên trùng mã với chương khác thì dùng `defaultTitle` + `: <tên phần>`), rồi ghi chữ, id phần, hash và `source_fetched_at`.
  - Lấy chữ dùng chung hàm với `syncOriginal` (tách hàm `fetchPlainText(partId)`: bỏ ảnh, rỗng thì `WATTPAD_PART_EMPTY`).
  - Lỗi từng phần (code + message) vào `failed`, lô vẫn chạy tiếp.
- `NovelController`: `POST /api/novels/{id}/wattpad/sync` body `{items:[{partId, chapterId}]}` → `{synced, created, failed}`.
- Test: lô hỗn hợp; mục hết hợp lệ; lỗi giữa lô; tạo chương có tiêu đề trùng mã; chạy song song bị 409; không gọi Wattpad trong transaction (theo cách test sẵn có của repo, nếu có).

## T5. Frontend: toolbar tab Chapters
- `NovelPage`: với truyện ORIGINAL, thay hai nút Export / Add chapter bằng một nút `⋯` "Chapter actions". Menu gồm Sync with Wattpad, Add chapter, Export theo spec, có mục mờ kèm tooltip.
  - Dùng lại component menu sẵn có (`NovelMenu` hoặc kiểu menu của `ChapterBar`). Nếu cần dùng chung thì tách ra `components/ui`.
  - Loại truyện khác giữ nguyên toolbar.
- Test: menu có đủ mục; Sync mờ khi chưa có link; Export mờ khi chưa có chương; truyện WATTPAD và SCREENSHOTS không đổi.

## T5b. Icon đã sync trong danh sách chương
- Backend: `ChapterSummary` (trong `NovelDetail.chapters`) thêm `lastSyncedAt` (`source_fetched_at`) và `wattpadModifiedAt`. Chỉ có giá trị với chương ORIGINAL, chương khác là null. Không gọi Wattpad.
- Frontend: `ChapterList` với `original`: chương có `lastSyncedAt` hiện icon đã sync màu `--brand-2-ink`, bọc trong `Tip`, tooltip và `aria-label` là `Wattpad: <formatInstantWithTime> · Last synced: <formatInstantWithTime>`. Không có `wattpadModifiedAt` thì chỉ `Last synced: …`. Kiểm tra lucide bản hiện tại có `CloudCheck` không; không có thì dùng `RefreshCw`.
- Test: có/không icon; nội dung tooltip đủ hai mốc và một mốc; truyện không phải ORIGINAL không có icon; `badgeIcons.test` hoặc test icon liên quan vẫn pass.

## T6. Frontend: dialog Sync with Wattpad
- `api/novels.ts`: thêm `getWattpadSyncPlan(novelId)`, `syncNovelFromWattpad(novelId, items)` và các type.
- Component mới `components/novel/WattpadSyncAllDialog.tsx` (+ `.css`, chỉ dùng token sẵn có, mobile-first). Các bước theo spec:
  - tải kế hoạch;
  - "Everything is up to date with Wattpad.";
  - danh sách checkbox, chọn sẵn theo bảng trạng thái, kèm huy hiệu và cảnh báo;
  - bước xác nhận (nút nguy hiểm khi có `LOCAL_EDITS` hoặc `NOT_SYNCED`);
  - đang chạy, khoá dialog;
  - kết quả: toast và danh sách lỗi.
- Huy hiệu trạng thái phải có icon (`badgeIcons.test` kiểm tra).
- Xong thì nạp lại truyện (`getNovel`).
- `lib/errors.ts`: thêm `WATTPAD_SYNC_RUNNING`.
- `WattpadSyncDialog` (trang chương): chọn sẵn phần có `partId === chapter.originalWattpadPartId` với nhãn "Linked", ưu tiên hơn "Same title".
- Test: chọn sẵn đúng; up-to-date; câu xác nhận có X/Y/Z; nút đỏ khi có chương đã sửa trong app; Cancel không gọi API; lỗi từng phần hiện trong dialog; nhãn Linked ở trang chương.

## T7. Tài liệu và kiểm tra cuối
- `CLAUDE.md` mục Truyện sáng tác: V31, ba cột mới, icon đã sync trong danh sách chương, hai endpoint, bảng trạng thái, toolbar ⋯, link spec và plan này.
- Chạy đủ test backend, frontend và tsc. Push nhánh, tạo PR (tiếng Anh): tóm tắt, link spec và plan, cách test tay, lệnh test và kết quả, kết thúc bằng dòng Claude Code.
