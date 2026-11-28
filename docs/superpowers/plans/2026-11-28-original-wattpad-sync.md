# Plan: Truyện sáng tác: sync chương từ Wattpad

Spec: [docs/superpowers/specs/2026-11-28-original-wattpad-sync-design.md](../specs/2026-11-28-original-wattpad-sync-design.md). Nhánh: `feat/novels-originals-default` (PR #82, user chọn gộp chung).

Mỗi task: viết test trước, code, chạy test, commit riêng (message tiếng Anh). Backend: `mvn -q test` (hoặc `-Dtest=...` khi làm, chạy đủ ở cuối). Frontend: `cd frontend && npx vitest run && npx tsc --noEmit -p .`. Không gọi Wattpad thật trong test (stub `WattpadClient` như `WattpadNovelServiceTest`).

## T1. Link Wattpad cho truyện ORIGINAL (backend)
- `NovelRequest` thêm `wattpadUrl` (cuối record; cập nhật mọi chỗ `new NovelRequest(...)`, gồm `withKind`, `withProfile`, test fixtures).
- `NovelValidator.validate`: với ORIGINAL, `wattpadStoryId` lấy từ `wattpadUrl` qua `WattpadLink.storyId`; trống → null; link chương / link lạ → `FieldError("wattpadUrl", …)` đúng câu trong spec. Kết quả trả về giữ `wattpadStoryId` cho cả WATTPAD và ORIGINAL. Loại khác bỏ qua `wattpadUrl`.
- `NovelService.update`: đặt `wattpadStoryId` cho ORIGINAL (kể cả xoá về null); trùng story id với truyện khác → `DuplicateWattpadNovelException` (bỏ qua chính truyện). `create` đã kiểm tra.
- Test: `NovelValidatorTest`, `NovelServiceTest` (create/update/trùng/xoá link; WATTPAD không đổi hành vi).

## T2. Danh sách phần và sync chương (backend)
- `WattpadNovelService`: `linkedStory(novelId)` nhận WATTPAD hoặc ORIGINAL có link; `parts` dùng nó (ORIGINAL thì `importedChapterId` null). import / fetch-translate / next vẫn dùng `wattpadNovel` (chỉ WATTPAD).
- `ChapterService.syncablePart(chapterId)` (readOnly): ORIGINAL có link, Draft → trả storyId; ngược lại `NovelNotWattpadException` / `ChapterPublishedException`.
- `ChapterService.replaceOriginalText(chapterId, text)` (transactional): kiểm tra lại Draft + ORIGINAL, cùng giới hạn độ dài như `update(..., text)`, đặt `text_vi`, `touch`, trả `ChapterDetail`.
- `WattpadNovelService.syncOriginal(chapterId, partId)`: theo đúng thứ tự spec (storyWithParts một lần, kiểm tra part thuộc truyện/không deleted, partText, `WattpadText.parse` rồi bỏ mọi placeholder ảnh và không tải ảnh, rỗng → `WATTPAD_PART_EMPTY`). Ngoài transaction. Log chỉ id + số ký tự.
- `ChapterController`: `POST /api/chapters/{id}/wattpad-sync` body `{partId}` (record mới) → 200 `ChapterDetail`.
- Test: service (thay text giữ title, Published 409, part lạ 404, deleted/rỗng 409, ảnh bị bỏ, Wattpad lỗi không ghi gì, ORIGINAL không link 409, parts nhận ORIGINAL, import từ chối ORIGINAL) + controller/MockMvc nếu repo có kiểu test đó.

## T3. Form truyện (frontend)
- `api/novels.ts`: `NovelInput.wattpadUrl?: string | null`.
- `NovelForm`: khi `original`, field **Wattpad link (optional)** dưới Author, hint theo spec, điền sẵn `https://www.wattpad.com/story/<id>` từ `initial.wattpadStoryId`, gửi `wattpadUrl` (blank → null); lỗi field `wattpadUrl` hiện dưới ô.
- `FanficsTab`: chỉ ghép `wattpadStoryId` cho novel có `sourceType !== 'ORIGINAL'`.
- `lib/errors.ts`: thêm/kiểm tra câu cho `DUPLICATE_WATTPAD_NOVEL` và `NOVEL_NOT_WATTPAD` ("This story has no Wattpad link." khi phù hợp; không làm hỏng câu đang dùng cho truyện dịch — nếu câu cũ khác, giữ câu cũ và dùng thông báo riêng ở dialog).
- Test: `NovelForm.test.tsx`, `FanficsTab.test.tsx`.

## T4. Sync ở trang chương (frontend)
- `api/novels.ts`: `syncChapterFromWattpad(chapterId, partId): Promise<ChapterDetail>`. Dùng lại `listWattpadParts`.
- `ChapterDetail` cần biết truyện có link: dùng dữ liệu novel trang chương đã có; nếu không có thì thêm `wattpadStoryId` (hoặc boolean `wattpadLinked`) vào `ChapterDetail` ở backend (ghi rõ trong commit).
- Component mới `components/chapter/WattpadSyncDialog.tsx` (+ `.css` nếu cần, chỉ dùng token sẵn có, mobile-first, breakpoint 520/760/1024): tải parts một lần khi mở, radio list, chọn sẵn phần cùng tên (chuẩn hoá: trim, gộp khoảng trắng, NFC, không phân biệt hoa thường) + nhãn "Same title", phần deleted disabled, lỗi → `Alert` + Retry, bước xác nhận đúng chữ trong spec với nút **Replace text** (kiểu danger) và **Cancel**, trạng thái "Syncing…".
- `ChapterPage`: mục menu ⋯ **Sync from Wattpad** chỉ cho ORIGINAL có link; disabled + `disabledReason` "Unpublish to sync from Wattpad." khi Published; disabled khi `locked`. Xong: thay chapter state bằng response (bỏ dirty), toast "Synced from Wattpad".
- Test: dialog (chọn sẵn, deleted, Cancel không gọi API, Replace gọi API, lỗi), ChapterPage (ẩn/hiện/mờ menu, editor cập nhật sau sync).

## T5. Tài liệu + kiểm tra cuối
- `CLAUDE.md` mục Truyện sáng tác: ORIGINAL được có `wattpad_story_id` (link tuỳ chọn), `POST /api/chapters/{id}/wattpad-sync`, `parts` nhận ORIGINAL, chỉ Draft, bỏ ảnh, tiêu đề giữ nguyên; link spec/plan này.
- Chạy toàn bộ test backend + frontend + tsc; cập nhật mô tả PR #82 (tiếng Anh): thêm phần Wattpad sync, cách kiểm tra, lệnh test và kết quả.

## T6. Ghi thời điểm sync, tạm dừng lưu khi sync, câu báo trùng link
- `ChapterService.replaceOriginalText` ghi `source_fetched_at` = `clock.instant()`; trang chương hiện dòng mờ "Synced from Wattpad dd/MM/yyyy HH:mm" cho chương ORIGINAL có giá trị này. Test: sync đặt đúng giờ, lưu tay không đổi; trang chương hiện/ẩn/cập nhật sau sync.
- `useChapterEditor(chapterId, paused)`: `ChapterPage` truyền `syncOpen` để tự lưu và Ctrl+S tắt khi hộp Sync mở (tránh PUT cũ ghi đè chữ vừa sync). Test với fake timers.
- `DuplicateWattpadNovelException.linked`: truyện ORIGINAL trùng link báo "This Wattpad story is already linked to “X”." (cùng mã `NOVEL_WATTPAD_EXISTS`); truyện dịch giữ câu cũ.
