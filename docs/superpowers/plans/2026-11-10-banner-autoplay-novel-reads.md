# Banner autoplay + Novel read counts — Plan

Branch: `feature/banner-autoplay-novel-reads`. Scope UI đã được user duyệt ngày 2026-11-10.

## Part 1 — Profile banner autoplay (`frontend/src/components/ui/FilmStrip.tsx`)

- Thêm prop `autoplayMs?: number` vào `FilmStrip` (mặc định không tự chạy). `ProfileBanner` truyền `5000`.
- Cứ mỗi `autoplayMs`, chuyển sang slide `(current + 1) % count` bằng `goTo`. Ảnh cuối thì quay về ảnh 0 (`scrollTo` 0).
- **Tạm dừng** khi gặp một trong các trường hợp:
  - pointer đang ở trên `.filmstrip` (`onPointerEnter`/`onPointerLeave`);
  - focus nằm trong `.filmstrip` (`onFocus`/`onBlur` kèm kiểm tra `relatedTarget`);
  - `document.hidden` (sự kiện `visibilitychange`);
  - lightbox đang mở: `FilmStrip` nhận thêm prop `paused?: boolean`, `ProfileBanner` truyền `open !== null`.
- **Không chạy** khi `usePrefersReducedMotion()` true, khi `count <= 1`, hoặc khi `autoplayMs` không được truyền.
- Người xem tự vuốt/scroll hoặc bấm ‹ › / chấm thì bộ đếm reset: dùng `setTimeout` và đặt lại mỗi khi `current` đổi, thay cho `setInterval`.
- Tests (vitest, fake timers) trong `FilmStrip.test.tsx`/`ProfileBanner.test.tsx`:
  - trượt sau 5 s;
  - quay vòng về ảnh đầu;
  - dừng khi hover, khi focus, khi lightbox mở;
  - không chạy với reduced motion hoặc 1 ảnh.
  - jsdom không có layout thật: mock `scrollTo` rồi assert lời gọi `scrollTo({ left: i * clientWidth })`.

## Part 2 — Novel read counts (Cloudflare Pages Function + D1)

### Cloudflare side (sinh ra lúc Publish)

- Thêm `cloudflareD1DatabaseId` vào `SubtitleStudioProperties.Publish`, đọc từ env `CLOUDFLARE_D1_DATABASE_ID` (`application.yml`). Để trống thì **tắt** tính năng: không deploy functions, nút/số lượt đọc ẩn hoặc hiện `–`.
- Thư mục làm việc của `wrangler pages deploy` là `site.getParent()`. Wrangler tìm `functions/` và `wrangler.toml` ở đó.
- Khi bật, bước Publish ghi vào thư mục cha đó:
  - `wrangler.toml`: `name = <project>`, `pages_build_output_dir = "<tên thư mục site>"`, `compatibility_date`, `[[d1_databases]] binding = "READS"`, `database_name = "novel-reads"`, `database_id = <id>`.
  - `functions/api/reads/index.js` (`GET`) và `functions/api/reads/[slug].js` (`POST`). Source JS đặt trong `src/main/resources/public-functions/` và được copy y nguyên.
  - Kiểm tra lại mỗi lần Publish rằng thư mục cha này không chứa rác cũ, hoặc dọn/ghi đè.
- Bảng D1 được tạo lazily trong function bằng `CREATE TABLE IF NOT EXISTS novel_reads (slug TEXT PRIMARY KEY, reads INTEGER NOT NULL DEFAULT 0)` (một lần mỗi isolate). Không cần bước setup tay ngoài việc tạo DB.
- `POST /api/reads/:slug`:
  - slug phải khớp `^[a-z0-9-]{1,100}$`;
  - **slug phải là truyện đã publish**: đọc JSON danh sách truyện qua `env.ASSETS.fetch(...)` (đường dẫn file thì tìm trong `NovelExporter`), cache trong isolate;
  - slug không hợp lệ thì trả `404`;
  - nếu hợp lệ thì chạy `INSERT ... ON CONFLICT(slug) DO UPDATE SET reads = reads + 1` rồi trả `204`.
- `GET /api/reads`: trả `{ "<slug>": n, ... }`, header `Cache-Control: public, max-age=60`.
- `_headers`/`_redirects`: đảm bảo `/api/*` không bị SPA fallback nuốt. Functions được ưu tiên trước `_redirects`, nhưng vẫn phải xác nhận.
- Test Java:
  - `PublicSiteBundle`/`PublishService` ghi đúng `wrangler.toml` + `functions/` khi có D1 id;
  - không ghi khi trống;
  - test bằng `FakeWrangler` hiện có;
  - token không bao giờ xuất hiện trong `wrangler.toml`.
- JS của function: thêm 1 test vitest nhỏ nếu dễ import (pure handler, mock D1). Không thì bỏ.

### Public frontend

- `ReaderPage` (`/novels/:slug/:chapterNo`): khi chương tải xong thì gọi `POST /api/reads/:slug` theo kiểu fire-and-forget.
  - Chống đếm trùng bằng `localStorage` key `reads:<slug>:<chapterNo>` lưu timestamp, < 24 h thì bỏ qua.
  - Mọi truy cập storage bọc trong try/catch. Lỗi mạng thì im lặng.
  - Gọi qua một module nhỏ `frontend/src/data/novelReads.ts` (`recordRead`, `fetchReadCounts`) để dễ mock trong test.
- `NovelCard` (`/novels`, `/novels/all`) và `PublicNovelPage` (`/novels/:slug`): thêm dòng meta với icon `Eye` (lucide) + `"{n} lượt đọc"`.
  - Định dạng số `vi-VN` kiểu rút gọn: `1,2 N`; dưới 1000 thì hiện nguyên số.
  - Lấy counts một lần (`GET /api/reads`) cho cả trang. Lỗi hoặc chưa có số thì **ẩn** dòng này.
  - Màu: chữ xám `meta`, không dùng cam/tím.

### Admin

- Backend: `GET /api/novels/reads` proxy tới `https://<project>.pages.dev/api/reads` qua `java.net.http.HttpClient`, timeout ngắn.
  - Tắt hoặc lỗi thì trả `{}`.
  - Không log token. Endpoint này không cần token vì API public.
- `NovelsPage` admin: thẻ truyện hiện `Eye` + số lượt đọc (khớp theo slug), không có thì hiện `–`. Admin vẫn dùng tiếng Anh: `"{n} reads"`.

## Docs / wrap-up

- `CLAUDE.md`: thêm dòng về `CLOUDFLARE_D1_DATABASE_ID`, `functions/` + `wrangler.toml` được sinh lúc Publish, endpoint `/api/reads`.
- `PROGRESS.md`: thêm mục tính năng mới kèm bước tay một lần:
  1. tạo D1 `novel-reads` trong dashboard Cloudflare;
  2. đặt env `CLOUDFLARE_D1_DATABASE_ID`;
  3. kiểm tra token có quyền D1 Edit nếu deploy báo lỗi binding.
- **Không** tự Publish/deploy lên Cloudflare.
