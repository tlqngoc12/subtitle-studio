# CLAUDE.md

Hướng dẫn khi làm việc trong repo này.

## Project

**Subtitle Studio:** web app chạy local. Người dùng dán link YouTube, app lấy phụ đề tiếng Anh bằng `yt-dlp`, làm sạch (khử lặp auto-caption) rồi xuất file `.srt` để dịch tay sang tiếng Việt.

- **Spec:** [PLAN.md](PLAN.md). Đây là nguồn sự thật cho thuật toán, API, DB schema và task breakdown T01–T11.
- **Tiến độ:** [PROGRESS.md](PROGRESS.md). Đọc file này trước để biết task nào xong và task nào tiếp theo.
- **Đã xong:** Phase 1 (lấy Engsub, xuất `.srt`) và Phase 2 (thêm Vietsub bằng URL + `.srt` đã dịch, xem video kèm Vietsub; spec [docs/superpowers/specs/2026-11-02-phase2-vietsub-design.md](docs/superpowers/specs/2026-11-02-phase2-vietsub-design.md), plan [docs/superpowers/plans/2026-11-02-phase2-vietsub.md](docs/superpowers/plans/2026-11-02-phase2-vietsub.md)).
- **Menu Profile** (EmiBonnie, Emi, Bonnie; khối tự do, ảnh ở `./data/media/`): spec [docs/superpowers/specs/2026-11-03-profiles-design.md](docs/superpowers/specs/2026-11-03-profiles-design.md), plan [docs/superpowers/plans/2026-11-03-profiles.md](docs/superpowers/plans/2026-11-03-profiles.md).
- **Menu Novels** (đăng tiểu thuyết dịch từ ảnh chụp: upload ảnh theo chương → Gemini đọc + dịch Thái → Việt kèm **sổ tay truyện** tự cập nhật → sửa tay, Draft/Published → Publish vẽ chương thành ảnh WebP có watermark, trang đọc public chặn sao chép): spec [docs/superpowers/specs/2026-11-05-novels-design.md](docs/superpowers/specs/2026-11-05-novels-design.md), plan [docs/superpowers/plans/2026-11-05-novels.md](docs/superpowers/plans/2026-11-05-novels.md).
- **Trình sửa Vietsub** (`/vietsub/:id/edit`, chỉ admin; bấm một hàng ở Manage Vietsub để mở: video bên trái, bảng hai cột `#` + Text bên phải, chỉ sửa text; dòng được tô là dòng đang chiếu hoặc dòng gần nhất ngay trước đó, tua (lùi hoặc nhảy > 1,5 giây) hoặc bấm `#` thì cuộn tới và tô dòng đó, không chuyển focus hay đặt con trỏ, phát bình thường chỉ tô; nút Back của trình duyệt không bị chặn khi còn sửa chưa lưu, lưu thành Manual qua `PUT /api/videos/{id}/vietsub/text`): spec [docs/superpowers/specs/2026-11-09-vietsub-live-editor-design.md](docs/superpowers/specs/2026-11-09-vietsub-live-editor-design.md), plan [docs/superpowers/plans/2026-11-09-vietsub-live-editor.md](docs/superpowers/plans/2026-11-09-vietsub-live-editor.md).
- **Chưa làm** (chỉ làm khi được yêu cầu): Phase 3 (chế độ kiểm tra song ngữ; sửa text Vietsub đã có ở trình sửa trên, chưa sửa timing), Phase 4 (engine dịch). Vietsub lưu ở bảng `vi_cue` với timing riêng; cột `cue.text_vi` vẫn để dành cho Phase 3.

## Lệnh

```bash
mvn test                                   # toàn bộ test (H2 in-memory, profile "test")
mvn test -Dtest=UrlParserTest              # một class
mvn test -Dtest=UrlParserTest#parsesShorts # một method
mvn spring-boot:run                        # chạy app, DB dev H2 ở ./data/dev (MODE=Oracle)
mvn verify -Poracle -Dskip.npm             # thêm nhóm *OracleIT trên Oracle thật (Testcontainers, cần Docker)

# frontend (từ T10)
cd frontend && npm run dev                 # Vite :5173, proxy /api → :8080
cd frontend && npm test                    # Vitest
mvn package                                # build cả frontend (Node tự cài qua frontend-maven-plugin) + jar
mvn test -Dskip.npm                        # chỉ test backend, bỏ qua frontend
```

Môi trường dev: Windows, JDK 21, Maven 3.9. Có cả Git Bash lẫn PowerShell.

## Stack và cấu trúc

- Backend: Java 21, Spring Boot 3.5.x, Maven, Spring Data JPA. Database chạy hằng ngày là **Oracle Free** (profile `oracle`, `docker compose`); H2 `MODE=Oracle` cho dev và test. Schema do **Flyway** quản lý (`src/main/resources/db/migration`). Chỉ cung cấp REST API `/api/*`, không render HTML.
- Frontend: **React + Vite + TypeScript** trong `frontend/` (từ T10). `frontend-maven-plugin` build vào `target/classes/static` khi `mvn package`, nên ra 1 jar duy nhất. Không commit file build.
- Base package: `com.subtitlestudio`. Tổ chức package theo chức năng, chỉ tạo khi task cần:
  - `config`: `SubtitleStudioProperties` (bind `subtitle-studio.*`)
  - `url`: `UrlParser` (T02)
  - `subtitle`: `VttParser`, `CaptionNormalizer`, `SrtWriter`, `SubtitleTrackSelector` (T03–T06)
  - `ytdlp`: `YtDlpClient` interface + impl (T06–T07)
  - `video`: entity, repository, `SubtitleService`, controller (T08–T09)
  - `web`: `@RestControllerAdvice` (T09)
  - `profile`: trang Profile: entity `T_*`, `ProfileBlockValidator`, `EmbedUrlResolver`, `MediaService` (ảnh), `ProfileService`, `ProfileBannerService` (banner xếp quạt, tối đa 8 ảnh), 2 controller
  - `novel`: menu Novels: entity `t_novel`/`t_chapter`/`t_chapter_page`/`t_novel_notebook`, `NovelService`, `ChapterService` (trang, `NaturalOrder`), `ChapterTranslationService` (dịch nền, chia lượt `ChapterBatches`), `GeminiChapterTranslator`, sổ tay (`NotebookService`, `NotebookMerger`, `NotebookText`, `GeminiNotebookUpdater`); `novel.render`: `NovelRenderer` (Java2D, font `fonts/Literata.ttf` OFL; `VERSION` 5; 3 khổ s/m/l = 1080×4800, 820×3645, 700×3111, mực đen trên giấy trong suốt, màu nền do CSS; `application.yml` `novel.render` chỉ còn `font-size`), `ImageEncoder` (WebP lossless qua `webp-imageio`, PNG dự phòng), `RenderCache` (`./data/novel-render/`, băm riêng từng khổ)
  - `translate`: `GeminiCaller` dùng chung cho mọi lần gọi Gemini (chuyển sang model dự phòng khi 503 hoặc 429 vì quota free tính riêng từng model, không retry cùng model, log tên quota bị hết, map lỗi sang `TranslationFailedException`)
  - `publish`: trang public: `SiteExporter` (JSON + ảnh theo allowlist), `NovelExporter` (chương Published thành ảnh, JSON không có text chương), `PublicSiteBundle` (bản build public + `_redirects`/`_headers`/`robots.txt`), `WranglerClient`, `PublishService`, `PublishController`
- `.gitignore` dùng `/data/*` (ở gốc repo) rồi bỏ ngoại lệ `!/data/prompts/` và `!/data/subs/`: hai thư mục này được theo dõi trong git (người dùng chọn ngày 2026-11-10, repo PUBLIC nên nội dung công khai và nằm trong lịch sử git); phần còn lại của `data/` (DB dev, logs, media, novel-render, `*.log`, `data/prompts/.history/`) vẫn bị bỏ qua. Tạo thư mục mới thì kiểm tra `git check-ignore -v <file>` (đã mất 5 file `frontend/src/data/` vì quy tắc cũ `data/`); trước khi xoá worktree xem `git status --ignored`.
- Bảng mới đặt tiền tố `T_` (bảng cũ `video`, `cue`, `vi_cue` giữ nguyên tên). Không đặt tên cột trùng từ khoá H2 (vd `value` → `item_value`).
- Cấu hình đọc qua `SubtitleStudioProperties` (record, `@Validated`). Không dùng `@Value` rải rác.

## Quy ước bắt buộc

### TDD
- Mỗi task: **viết test trước → chạy thấy fail đúng lý do → viết code tối thiểu cho pass → refactor**.
- Unit test chạy trên **dummy data, không gọi mạng, không gọi yt-dlp thật**. Dùng fake `YtDlpClient` (Mockito hoặc class giả). `YtDlpClientImpl` test bằng chương trình Java giả `FakeYtDlp` (trong `src/test`, chạy qua `java -cp`; chế độ chọn bằng `-Dfake.mode=...`). Không dùng shell script vì `ProcessBuilder` trên Windows không chạy được `.sh`.
- Fixture đặt trong `src/test/resources/` (vd `vtt/auto-rolling.vtt`, `ytdlp/info-manual-only.json`).
- Fixture `.vtt`/`.srt` phải giữ đúng byte: dòng chỉ có dấu cách là có chủ đích (YouTube auto-caption có loại dòng này). Tạo bằng `printf` và kiểm tra bằng `cat -A`; `.gitattributes` đặt `-text -whitespace` cho 2 loại file này.
- Trước khi báo xong task: chạy **toàn bộ** `mvn test`, không chỉ class vừa viết.
- **Golden test** (`GoldenSubtitleTest`) dùng phụ đề YouTube thật trong `src/test/resources/golden/`. Thư mục này **gitignore, không bao giờ commit** (bản quyền, repo public). Thay đổi `VttParser`/`CaptionNormalizer`/`SrtWriter` làm golden fail thì phải xem diff bằng mắt rồi mới cập nhật golden, không cập nhật mù.

### Bảo mật khi gọi yt-dlp
- `videoId` phải qua `UrlParser`, khớp regex `^[A-Za-z0-9_-]{11}$`, rồi mới được truyền vào process.
- `ProcessBuilder` dùng **list argument**, tuyệt đối không qua shell (`sh -c`, `cmd /c`).
- Đọc stdout và stderr song song. Hết timeout thì `destroyForcibly()`.

### Lỗi
- Mỗi lỗi nghiệp vụ là một exception riêng, được map sang `ProblemDetail` có field `code` (bảng ở PLAN.md, mục 6): `INVALID_URL` 400, `NO_ENGLISH_SUBTITLE` 422, `YTDLP_FAILED` 502, `YTDLP_TIMEOUT` 504, `VIDEO_NOT_FOUND` 404.

### Frontend
- TDD giống backend: viết test Vitest + React Testing Library trước. Giả lập `fetch` bằng `vi.stubGlobal`, không gọi backend thật.
- Truy vấn theo role/label (`getByRole`, `getByLabelText`), không dùng class CSS hay test id. Nút chỉ có icon/text ngắn phải có `aria-label` đủ nghĩa.
- **Màu (bắt buộc với mọi phần giao diện mới, kể cả toast, tab, thẻ, badge, trang public):** dùng 2 màu chủ đạo qua token trong `src/styles/tokens.css`: `--brand` (cam #F39A42: hành động chính, nhấn mạnh, thành công) và `--brand-2` (tím #D9A1D9: "đang ở đây"/đang chọn, thông tin, viền phụ). Chữ trên hai màu này dùng `--on-brand` (chữ đậm), không dùng chữ trắng. Thư viện UI có màu mặc định (sonner, Radix…) thì override bằng các token này. `--danger` (đỏ) chỉ cho lỗi/xoá; focus ring dùng `--focus` (tím: `--brand-2-ink` sáng, `--brand-2` tối; không hard-code màu focus). Bảng phạm vi UI phải ghi rõ chỗ nào cam, chỗ nào tím.
- **Vai trò màu:**

  | Vai trò | Màu |
  |---|---|
  | Hành động và nhấn: nền nút chính, **viền nút phụ**, link, điểm nhấn | Cam: `--brand` cho nền/viền; `--brand-ink` cho chữ và link trên nền sáng |
  | Trạng thái, "đang ở đây/đang chọn", hover: pill menu, gạch chân tab, chương đang đọc, viền nút khi hover | Tím: `--brand-2`; `--brand-2-ink` cho chữ/icon cần ≥ 3:1 |
  | Bảng màu ấm (2026-11-09) | Sáng: `--paper` #F7F3EE, `--surface` #FFF, `--ink` #221C26 (tím sẫm), `--muted` #5E5666, `--rule` #E3DCD3, `--field-border` #8B8178, `--brand-ink` #A35509, `--brand-2-ink` #8E4F8E. Tối: `--paper` #16121B, `--surface` #211B28, `--ink` #EEE8F3, `--muted` #A9A1B4, `--rule` #342C3E, `--field-border` #776D84, `--brand` #F5A25A; `--brand-ink`/`--brand-2-ink` = màu nền tương ứng |
  | Nút chính khi hover | Nền `--brand-hover` (sáng #E8862C, tối #F8B47A); không đổ tím, không `filter: brightness` |
  | Khung video tối (`UrlForm`, `VideoPlayer`) | `--frame` #221C26 + `--on-frame` #EEE8F3, giống nhau ở hai giao diện; focus `--brand-2` (≥ 3:1). Không hard-code hex; ngoại lệ chỉ `#000`/`#fff` cho shadow, mask, lớp phủ phụ đề |
  | Focus bàn phím | `--focus` (tím, ≥ 3:1 trên `--paper`/`--surface`; trên khung video tối dùng `--brand-2`) |
  | Một phần tử | Một màu thương hiệu mỗi lúc: cam khi đứng yên, tím khi hover hoặc đang chọn, không dùng cả hai |

  Nút phụ (`button--small`, `button--icon`, `filter-button`, nút trong trang) viền cam, hover viền tím; nút disabled viền `--rule`. Ô nhập và select giữ `--field-border`. Link thường (`a` không có class) cam gạch chân, hover tím.
- **CSS:** token (màu, `--space-*` bước 4 px, `--shadow-overlay`/`--shadow-drag`, `--brand-ink`/`--brand-2-ink` cho chữ/icon trên nền sáng, cỡ chữ) và bảng breakpoint **520 / 760 / 1024 px** nằm ở đầu `src/styles/tokens.css`; chỉ dùng đúng các giá trị đó trong `@media` (mặc định `max-width` 520/760, chỉ viết `min-width` cho luật chỉ có ở màn rộng) và dùng token thay vì số tay. `styles/base.css` giữ phần dùng chung (button, field, badge, alert, tabs, reset); CSS của một component/trang nằm trong file `.css` cạnh file `.tsx` và được chính file đó `import` (không thêm vào `base.css`). Lớp dùng ở cả trang admin lẫn public thì file CSS phải được mọi nơi dùng nạp (qua component sở hữu hoặc `styles/index.css`). Test đọc CSS dùng `src/test/css.ts`. Đổi/chuyển CSS hàng loạt thì chạy `node frontend/scripts/check-css-split.mjs <commit>`.
- **Component dùng chung** (`src/components/ui/`): lỗi → `Alert`, đang tải → `LoadingText`, nút icon có tooltip → `IconButton`/`IconLink` (tooltip = `aria-label`; nếu cần khác nhau thì dùng `Tip` + nút thường), tiêu đề trang → `PageHeader`, bìa truyện → `Cover`, ô tìm → `SearchBar`, popover Radix → `PopoverPanel`, ảnh xếp quạt (tự chuyển, tạm dừng, `‹ ›`) → `FanCarousel` (banner Novels), mỗi lần một ảnh rộng hết khung, vuốt/`‹ ›` chuyển một slide, có dấu chấm, không tự chuyển, mô tả khi hover/focus → `FilmStrip` (banner Profile), xem ảnh lớn → `ImageLightbox` (Radix Dialog). Đừng chép lại markup của chúng.
- **Tab:** dùng chung kiểu gạch chân `tabs__list` / `tabs__tab` (Radix Tabs khi cùng trang; `Link` + `aria-current="page"` khi mỗi tab là một route). Không dùng pill cho tab. Trên điện thoại: vùng chạm ≥44px, tiêu đề danh sách tối đa 2 dòng. Dữ liệu dùng chung cho nhiều tab thì tải ở cấp trang (Radix gỡ tab ẩn → tải lại, giật). Tab Radix dùng `components/ui/TabTrigger` thay `Tabs.Trigger`: Radix gọi `focus()` bằng script khi nhấn chuột và Chromium coi đó là `:focus-visible` nên click hiện viền focus; `TabTrigger` đánh dấu `data-pointer` lúc `pointerdown` và `.tabs__tab[data-pointer]:focus-visible` ẩn viền, còn phím Tab/mũi tên vẫn hiện viền.
- Thêm route phía client (React Router) thì phải thêm đường dẫn đó vào `SpaForwardController` (+ test), nếu không F5 sẽ 404.
- Chuỗi giao diện (menu, nút, label, thông báo, lỗi) bằng **tiếng Anh**; giữ thuật ngữ "Engsub" / "Vietsub". Nội dung người dùng nhập và dữ liệu test (tên video, Vietsub) vẫn có thể là tiếng Việt. Thông báo lỗi lấy theo `code` của ProblemDetail (`src/lib/errors.ts`), luôn có fallback khi thiếu `code`. Lỗi kiểm tra dữ liệu từ backend (`FieldError.message`) cũng bằng tiếng Anh.
- Font phải có subset `vietnamese` (hiện dùng Be Vietnam Pro) vì nội dung vẫn có tiếng Việt; chữ Thái dùng Noto Sans Thai.
- Icon dùng `lucide-react` (không tự vẽ SVG; lucide 1.x không còn icon thương hiệu → logo mạng xã hội dùng `simple-icons`, xem `profile/BrandIcon.tsx`). Nút chỉ có icon phải có `aria-label` và bọc trong `<Tip label=…>` (`components/Tip.tsx`, Radix tooltip: hover + focus + Esc); không dùng `title` (ngoại lệ: nút toàn màn hình của player, vì tooltip render ra ngoài khung fullscreen). Test tooltip bằng `expectTooltip()` (`src/test/tooltip.ts`).
- Chuyển động dùng `motion` với preset trong `src/lib/motion.ts`; chỉ để trả lời hành động của người dùng (thêm/xoá/đổi chỗ/mở form), không animate khi tải trang. `App` có `MotionConfig reducedMotion="user"`.
- Danh sách/trang trống dùng `<EmptyState icon=…>`: icon + một câu chỉ bước tiếp theo.
- **Phím tắt trang xem** (`/vietsub/:id`, `lib/usePlayerShortcuts.ts`; phím của YouTube chỉ chạy khi focus trong iframe): K/Space phát-dừng, J/L lùi-tới 10 giây, ←/→ 5 giây, M tắt tiếng, C ẩn/hiện Vietsub (nhớ trong localStorage), F toàn màn hình, **T chế độ rạp (theater)**, Shift+N/Shift+P video kế/trước, `?` mở danh sách phím. Bỏ qua khi đang gõ (`isTyping`), khi có Ctrl/Meta/Alt, trong dialog/popover; Space không bắt khi focus ở nút/link. Nút trong khung player dùng `title` (tooltip `<Tip>` render ngoài khung fullscreen).
- **Chế độ rạp và cỡ chữ phụ đề** (`lib/viewerPrefs.ts`, cùng kiểu try/catch với `watched.ts`, dùng chung cho admin và public vì `WatchPage` dùng chung): chế độ rạp (nút `RectangleHorizontal` trong khung player cạnh nút toàn màn hình, dùng `title` như nút fullscreen; phím T; `aria-pressed`; tím `--brand-2` khi bật) thêm class `watch--theater`: player rộng hết bề ngang nội dung (bỏ giới hạn chiều cao màn hình của W1) và panel playlist xuống dưới; nhớ trong localStorage `subtitle-studio.theater`. Cỡ chữ phụ đề S / M / L (radio group trong popover `?`, tím khi chọn, ≥44px) là hệ số `--caption-scale` 1 / 1,25 / 1,5 nhân với cỡ chữ responsive của `SubtitleOverlay`; mặc định **S** (= cỡ cũ, không đổi gì tới khi người xem chọn); nhớ trong `subtitle-studio.captionSize`; áp dụng cả khi fullscreen vì overlay nằm trong khung player. Trình sửa Vietsub không truyền `size` nên không đổi.
- **"Đã xem"** (`data/watched.ts`, localStorage `subtitle-studio.watched`, cùng kiểu `novelReads.ts`): video đã xem khi `ended` hoặc qua 90% thời lượng; lỗi storage không làm hỏng trang (giữ trong bộ nhớ). Chỉ ở trình duyệt người xem, chạy cả ở admin lẫn public (`WatchPage`/`VietsubListPage` dùng chung, không gửi gì lên server). Panel playlist, danh sách video và "Continue: EP N" đọc qua `useWatched()`.
- Màn hình xem: không phụ thuộc `:hover` của khung player (khi chuột ở trên iframe YouTube, trang không nhận hover); phụ đề YouTube phải tắt (`cc_load_policy: 0` + `unloadModule('captions')`).
- Version package cố định (không dùng `^`); `package-lock.json` được commit; `frontend/node`, `node_modules` không commit.

### Database (Oracle + Flyway)
- Không sửa migration đã push hoặc đã chạy trên DB thật; thay đổi schema = file mới `V{n}__mo_ta.sql` viết bằng SQL Oracle.
- Cột chuỗi luôn `VARCHAR2(n CHAR)` (Oracle mặc định đếm byte; chữ Thái/Việt 2–3 byte/ký tự). Cột số nguyên dùng placeholder `${bigint}` / `${int}` (H2 báo `NUMBER` là `NUMERIC`, Hibernate validate không nhận).
- Oracle lưu chuỗi rỗng `''` thành `NULL`: giá trị cho cột `NOT NULL` không bao giờ được rỗng (lọc hoặc thay trước khi lưu).
- Không truyền `''` làm tham số truy vấn để nói "không có" (vd `id <> :excludeId` với `""`): Oracle coi nó là NULL nên điều kiện không bao giờ đúng và trả 0 dòng (H2 và mock không bắt được). Viết query riêng không có tham số đó và có `*OracleIT` kiểm chứng.
- Hibernate chỉ `validate`; không bật `ddl-auto` khác. Id dùng `SEQUENCE` với `allocationSize` khớp `INCREMENT BY` của sequence.
- Thay đổi liên quan DB: chạy cả `mvn test` và `mvn verify -Poracle -Dskip.npm` trước khi commit.
- Nhiều nhánh có thể cùng thêm migration: trước khi merge, kiểm tra số version không trùng (đã từng trùng `V2`), đổi số trên nhánh chưa merge.
- Playlist (`t_playlist`, `t_playlist_item`): `position` luôn liền mạch 1..n, `PlaylistService` ghi lại sau mỗi lần thêm/gỡ/sắp xếp; không có unique `(playlist_id, position)` để đổi thứ tự không bị trùng giữa chừng. Playlist chỉ chứa video có Vietsub.
- Bảng ở package khác tham chiếu `video` (vd `t_playlist_item`): package `video` không phụ thuộc vào chúng mà phát `VideoRemovalEvent` trong transaction, trước khi gỡ Vietsub (`VietsubService.clear`) hoặc xoá video (`SubtitleService.delete`); bên kia `@EventListener` xoá dòng của mình trước (khoá ngoại).

### Gemini (dịch Vietsub, package `translate`)
- Test **không bao giờ gọi Gemini thật**: dùng `GeminiTranslator` giả, hoặc `FakeGeminiServer` (HTTP server trong test) cho `GeminiTranslatorImpl`.
- `GEMINI_API_KEY` không bao giờ xuất hiện trong log, message exception hay commit. `SubtitleStudioProperties.Gemini.toString()` đã che key.
- Vietsub `AUTO` (Gemini) không bao giờ ghi đè `MANUAL` (tự upload): kiểm tra lại dưới khoá dòng khi lưu (`VietsubService.saveAuto`).
- Log của phần dịch chỉ ghi số liệu và id (model, `TranslationOutput.describe`, id video), **không bao giờ ghi nội dung phụ đề** (gốc hay bản dịch) hay câu trả lời thô của Gemini. Test kiểm tra điều này bằng `OutputCaptureExtension`.
- Hồ sơ dịch trong `./data/prompts/*.md` (kể cả `novels/`) và phụ đề `./data/subs/` được commit vào git theo lựa chọn của người dùng ngày 2026-11-10 (repo PUBLIC). Bản sao lưu tự động `data/prompts/.history/` và phần còn lại của `data/` không commit. Mẫu hồ sơ nằm ở `src/main/resources/prompts/_example.md`.
- **Video dài dịch theo đoạn** (`TranslationService`, `TranslationParts`, `PartialTranslationStore`): giới hạn `gemini.max-duration` là **180 phút** (dài hơn: `VIDEO_TOO_LONG`). Video tới `gemini.part-duration` (**45 phút**) dịch bằng một request như cũ, không tạo file tạm. Dài hơn thì chia ở ranh giới câu: một câu thuộc đoạn hiện tại khi `startMs` cách câu đầu đoạn < 45 phút, không cắt đôi câu, không có đoạn rỗng. Các đoạn dịch lần lượt; từ đoạn 2 `VideoContext.previousLines` mang 8 dòng cuối (Engsub + Vietsub) của đoạn trước, gửi trong mục `# Đoạn ngay trước (để giữ mạch, KHÔNG dịch lại)`. Mỗi đoạn xong được ghi ngay vào `<data-dir>/translate-partial/<videoId>.json` (`{profile, cueCount, parts:[{index, lines:[{idx,text}], model}]}`, qua file tạm + `ATOMIC_MOVE`, nằm dưới `/data/*` nên git bỏ qua); khi mọi đoạn xong thì ghép, `saveAuto` (model lưu là các model khác nhau theo thứ tự dùng, nối bằng `, `) rồi xoá file. Đoạn lỗi thì video FAILED với thông báo `Could not translate part 2/3: … Translate again continues from part 2.`, file giữ nguyên, **Translate again** chỉ dịch các đoạn còn thiếu. File chỉ được dùng lại khi `profile` và `cueCount` khớp và các dòng khớp cách chia hiện tại; nếu không thì bị xoá. Xoá video hoặc xoá Vietsub (`VideoRemovalEvent`) cũng xoá file. `VideoDto.activePart` ("2/3", null khi một đoạn) đi cùng `activeModel`; giao diện hiện `Translating part 2/3 with Gemini (...)…`. Log chỉ có id và số liệu (`translate <id>: part 2/3, N lines, model X`).
- **Ngữ cảnh phim bộ** (`VideoContext(title, channel, description, examples, previousLines)`): mỗi bộ phim dùng **một hồ sơ** nhất quán (vd `Moonshadow.md`).
  - **Ví dụ** (`ExampleSource` + `ExampleSelector`): lấy từ tối đa **3 video** có `translation_profile` = hồ sơ đang dùng, `edit_status = DONE`, `vi_source = MANUAL`, không phải chính video đang dịch, `vi_updated_at` mới nhất trước. Ghép Engsub (`cue`) với Vietsub cuối (`vi_cue`) theo `start_ms` bằng nhau. Ưu tiên: (1) câu đã sửa tay (khác dòng cùng `start_ms` trong `<id>.vi_auto.srt`; thiếu hoặc hỏng file thì bỏ qua bước này), (2) câu có tên riêng (chữ hoa giữa câu) hoặc đại từ xưng hô (chị/em/anh/tôi/cậu/P'), (3) câu dài nhất. Bỏ câu rỗng/chỉ ký hiệu/trùng. Hằng số trong code: 3 video, 60 cặp, 6.000 ký tự. Video cũ chưa chuyển hồ sơ (lựa chọn (a)): ví dụ chỉ có khi đã có tập dịch bằng hồ sơ đó và được Done.
  - **Mô tả YouTube**: cột `video.description` (CLOB, V12), lưu khi Get Engsub; video cũ (null) được bổ sung bằng một lần `yt-dlp -J` khi bấm Translate again. `DescriptionCleaner` bỏ dòng chỉ có URL/hashtag/mention và dòng Subscribe/Follow/Official/©, gộp dòng trống, cắt 1.500 ký tự; không còn gì thì không gửi. **Không đưa `description` vào `VideoDto`/`PublicVideo`.**
  - **Lỗi ngữ cảnh không bao giờ làm hỏng lượt dịch:** lỗi khi dựng ví dụ hoặc lấy mô tả chỉ được log (tên exception, không có nội dung phụ đề hay mô tả) rồi dịch tiếp không có phần đó. Log một dòng `examples: N pairs from M videos (K corrected)`.
  - **Phân tích câu đã sửa** (Vietsub › Profiles, `/vietsub/profiles?profile=<tên>`; `CorrectionReader` đọc bộ ba Engsub / `vi_auto.srt` / `vi_cue` ghép theo `start_ms`, dùng chung với `ExampleSource`; `ProfileAnalyzer`): lấy **mọi** video `DONE` + `MANUAL` cùng hồ sơ, chỉ câu đã sửa (AI khác bản cuối sau khi chuẩn hoá khoảng trắng), video mới trước, tối đa **300 câu và 30.000 ký tự** mỗi request. API trong `PromptProfileController`: `GET /api/prompt-profiles/{name}` → `{name, text, sha, stats:{videos, correctedLines}}` (`sha` = SHA-256 của text UTF-8); `POST .../analyze` → `{proposed, rules:[{text,count}], basedOn, model, sha}`, đồng bộ, **đúng 1 request Gemini** qua `GeminiCaller` (JSON schema, có fallback model), **không ghi file**; không có câu đã sửa thì 400 `NO_CORRECTIONS` và không gọi Gemini; kết quả rỗng/sai schema/quá 20 KB thì 502 `ANALYSIS_INVALID`; lỗi Gemini (bận, hết quota…) thì 502 `GEMINI_FAILED` với thông báo cho người dùng. `PUT .../{name}` body `{text, baseSha}` → `{sha}`: kiểm tra UTF-8, không rỗng, ≤ 20 KB (400 `INVALID_PROFILE_TEXT`), `baseSha` khớp file hiện tại (khác thì 409 `PROFILE_CHANGED`), chép bản cũ sang `data/prompts/.history/<tên>-<yyyyMMdd-HHmmss>.md` (không lẫn vào `list()`), rồi ghi qua file tạm + `ATOMIC_MOVE`. Hồ sơ Novels không có API này. Test dùng thư mục tạm và Gemini giả, không bao giờ ghi vào `data/prompts` thật.

### Trang public (package `publish`, frontend `PublicApp`)
- Dữ liệu public theo **allowlist**: chỉ ghi record riêng (`PublicVideo`, `PublicPlaylist*`), không serialize thẳng `VideoDto`/entity. Thêm field cho khách xem = sửa `PublicVideo.java` **và** `PublicVideo` trong `frontend/src/data/types.ts`, kèm test chặn field nội bộ.
- Trang chạy cả ở bản public (`VietsubListPage`, `WatchPage`, `ProfilePage` và component con) đọc dữ liệu qua `useSite().source` (không gọi `api/*` trực tiếp), chỉ dùng field của `PublicVideo`, và ẩn mọi nút/link quản trị khi `useSite().readOnly`.
- **Chỉ xuất Vietsub Done:** `SiteExporter` chỉ xuất video có `viCueCount > 0` và `editStatus == DONE` (cả `videos.json`, `videos/<id>.json` lẫn playlist); video chưa Done (AI, hoặc Manual đang In progress) không có trên bản public (link trực tiếp báo Not found). Playlist không còn video Done nào thì không xuất (không có file riêng, không có trong `playlists.json`); playlist hỗn hợp chỉ giữ video Done, số lượng và ảnh bìa tính lại. `PublicVideo` không có field `editStatus`. Trang admin không đổi.
- **Trạng thái sửa Vietsub (`video.edit_status`, V11):** `null` | `IN_PROGRESS` | `DONE`. Lưu text trong editor: `null` thành `IN_PROGRESS`, `IN_PROGRESS` giữ nguyên, `DONE` giữ `DONE`. Upload/Replace `.srt` thủ công gán `DONE`. Gemini (AUTO) không đổi trạng thái. `PUT /api/videos/{id}/edit-status` (`{status}`) đánh dấu Done hoặc Reopen, chỉ cho Vietsub MANUAL (AUTO trả `VIETSUB_NOT_MANUAL`), từ chối khi đang TRANSLATING, không đổi `viUpdatedAt`. Migration V11 gán `DONE` cho mọi video MANUAL có sẵn. Editor: nút Mark as done bị khoá khi còn thay đổi chưa lưu; focus một dòng khác dòng focus trước thì tua video tới dòng đó và phát (nút `#` chỉ tua và cuộn; readonly khi đang dịch thì không tua). Mỗi hàng hiện dòng Engsub chỉ đọc ngay trên textarea (ghép theo cùng `startMs`, lấy bằng `getCues`; lỗi tải thì bỏ qua).
- Route của bản public: `/vietsub/list`, `/vietsub/:id`, `/profiles/:slug` (+ chuyển hướng `/`, `/profiles`, trang "Page not found"). Thêm route public mới thì sửa `PublicApp.tsx`.
- `CLOUDFLARE_API_TOKEN` không bao giờ vào log, message, `toString()` hay commit; chỉ truyền qua env của tiến trình `wrangler`. Không log output của wrangler.
- **Lượt đọc truyện** (Cloudflare Pages Functions + D1): bật khi có `CLOUDFLARE_D1_DATABASE_ID` (trống = tắt hẳn). Lúc Publish, `ReadCountsFunctions` ghi `wrangler.toml` (binding D1 `READS`) và `functions/api/reads/{index,[slug]}.js` (nguồn ở `src/main/resources/public-functions/`) vào **thư mục cha** của thư mục site (`publish-tmp/`, cwd của wrangler), rồi dọn lại sau khi deploy (cũng dọn khi tắt, để không sót bản cũ). `GET /api/reads` trả `{slug: n}`; `POST /api/reads/:slug` chỉ đếm slug có trong `data/novels.json` đã publish. Frontend chỉ đếm khi mở một chương (`ReaderPage`, chống đếm trùng 24 giờ/trình duyệt/chương bằng localStorage), qua `data/novelReads.ts`; admin đọc tổng qua `GET /api/novels/reads` (proxy tới `<project>.pages.dev/api/reads`, lỗi/tắt thì `{}`). Token không bao giờ vào `wrangler.toml`.
- **Trang đọc truyện public:** JSON chương có `formats` (s/m/l → danh sách ảnh); `ReaderPage` chọn khổ theo màn hình và cỡ chữ, theme (Sáng/Giấy/Tối/Đen OLED) đổi bằng CSS. Key localStorage: `reader-theme`, `reader-size`, `novel-shelf` (tủ sách); `reader-night` cũ được chuyển sang `reader-theme`, `reader-width` đã bỏ.
- **Giới hạn file khi Publish:** `PublishStatus.fileCount` đếm file của site; cảnh báo từ 16.000, chặn khi > 20.000 (giới hạn Cloudflare Pages Free; ~62 file/chương, ~300 chương).
- Test `WranglerClientImpl` bằng `FakeWrangler` (Java, `java -cp`, `-Dfake.mode=`), không gọi Cloudflare thật.

### Locale
- `String.format`, `toLowerCase`/`toUpperCase` và các hàm format khác phải truyền `Locale.ROOT`. Locale mặc định có thể sinh chữ số không phải ASCII và làm hỏng file `.srt`.

### Test và Spring
- `@SpringBootTest` phải kèm `@ActiveProfiles("test")` để dùng H2 in-memory. Test không được tạo file trong `./data`.
- `@CsvSource` có giá trị chứa dấu phẩy (vd timestamp SRT `00:00:01,000`) thì dùng `delimiter = '|'`.
- Ưu tiên test slice (`@WebMvcTest`, `@DataJpaTest`) hoặc unit test thuần, thay vì `@SpringBootTest`.
- Spring chuẩn hoá `Path` khi bind (`./data` thành `data`). Khi assert path thì so theo `toAbsolutePath().normalize()`.

## Sau mỗi task

1. Cập nhật [PROGRESS.md](PROGRESS.md): bảng tiến độ, nhật ký, quyết định và lưu ý mới.
2. Báo kết quả `mvn test` thật (số test, pass/fail).
3. **Chỉ commit khi được yêu cầu.** Commit message ngắn gọn, ví dụ `T02: UrlParser`.

## Giao tiếp

- Trả lời bằng tiếng Việt có dấu đầy đủ. Tên kỹ thuật và identifier giữ nguyên.
- Mọi thứ trong code đều viết **tiếng Anh**: comment, Javadoc, tên class/method/biến, comment trong file config, message trong exception và log. Chuỗi hiển thị cho người dùng trên frontend cũng bằng tiếng Anh (xem mục Frontend).
