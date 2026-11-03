# Subtitle Studio

Dán link YouTube, nhận về phụ đề tiếng Anh đã làm sạch dưới dạng file `.srt` để dịch tay sang tiếng Việt.

- Ưu tiên phụ đề do người đăng tải lên (manual); không có thì dùng phụ đề tự động (auto-generated).
- Với phụ đề tự động, khử kiểu hiển thị "cuộn" của YouTube (mỗi câu bị lặp 2–3 lần) và gộp các đoạn ngắn thành câu trọn ý.
- Lưu lại các video đã lấy; lấy lại cùng video thì trả về ngay, không gọi YouTube lần nữa.
- File `.srt` dùng UTF-8, CRLF, có tuỳ chọn BOM cho player cũ.

Và xem video với Vietsub:

- Menu **Vietsub** (`/vietsub`): dán link YouTube và chọn file `.srt` tiếng Việt bạn đã dịch (giữ nguyên timing) → app lưu Vietsub. Bên dưới là danh sách quản lý với các nút Download / Replace / Delete Vietsub.
- Menu **Danh sách Vietsub** (`/vietsub/list`): chọn video để xem trên YouTube kèm Vietsub. Nút ⛶ ở góc dưới bên phải (hoặc phím `F`) bật/tắt toàn màn hình mà Vietsub vẫn hiện; phụ đề có sẵn của YouTube được tắt.

Kế hoạch các phase sau (sửa trực tiếp, chế độ kiểm tra song ngữ, engine dịch) nằm trong [PLAN.md](PLAN.md).

## Chạy bằng Docker (khuyến nghị)

Cần Docker (Docker Desktop trên Windows/macOS). Compose chạy 2 container: **Oracle Database Free** và app.

```bash
cp .env.example .env          # rồi đặt mật khẩu của bạn trong .env (file này không được commit)
docker compose up -d --build  # lần đầu tải image Oracle (vài GB)
docker compose ps             # chờ cả hai báo (healthy)
```

Mở http://localhost:8080. Thiếu `.env` thì compose dừng và báo biến nào còn thiếu.

- **Database:** Oracle, dữ liệu trong volume Docker `subtitle-studio_oracle-data`. Schema do Flyway tạo (`src/main/resources/db/migration`).
- **`./data`:** chỉ còn chứa file `.vtt` gốc (`subs/`). Trên Linux, thư mục này phải cho uid 10001 ghi được: `sudo chown -R 10001 data`.
- Image app có sẵn JRE 21, yt-dlp và deno (JS runtime mà yt-dlp cần để xử lý YouTube).

### Xem dữ liệu bằng SQL Developer / DBeaver

| | |
|---|---|
| Host / cổng | `localhost` / `1521` (chỉ mở cho máy này) |
| Service name | `FREEPDB1` |
| User / mật khẩu | `subtitle_studio` / giá trị `SUBTITLESTUDIO_DB_PASSWORD` trong `.env` |

### Sao lưu và khôi phục

Sao lưu nguội (dừng hẳn để file dữ liệu nhất quán):

```bash
docker compose down
docker run --rm -v subtitle-studio_oracle-data:/src -v D:/backup:/backup alpine tar czf /backup/oracle-data-2026-11-03.tgz -C /src .
docker compose up -d
```

Khôi phục vào volume rỗng: `docker compose down`, `docker volume rm subtitle-studio_oracle-data`, rồi
`docker run --rm -v subtitle-studio_oracle-data:/dst -v D:/backup:/backup alpine tar xzf /backup/oracle-data-2026-11-03.tgz -C /dst`, rồi `docker compose up -d`.

Tham khảo (xuất logic bằng Data Pump, công cụ DBA Oracle hay dùng):

```bash
docker compose exec oracle expdp subtitle_studio/<mật khẩu>@FREEPDB1 schemas=subtitle_studio directory=DATA_PUMP_DIR dumpfile=ss.dmp
```

Quên mật khẩu SYS: `docker compose exec oracle resetPassword <mật khẩu mới>`.

## Chạy trực tiếp trên máy

Cần:

- JDK 21
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) trong `PATH`, kèm [deno](https://deno.com)
  - Windows: `winget install yt-dlp.yt-dlp DenoLand.Deno`
  - macOS: `brew install yt-dlp deno`
- Maven 3.9+ (không cần cài Node: Maven tự tải Node để build frontend)

```bash
mvn package
java -jar target/subtitle-studio-0.1.0-SNAPSHOT.jar
```

Mở http://localhost:8080. Mặc định dùng **H2** (DB dev `./data/dev.mv.db`, chạy cùng migration Oracle ở `MODE=Oracle`). Muốn chạy với Oracle (ví dụ Oracle trong compose): đặt `SPRING_PROFILES_ACTIVE=oracle`, `SUBTITLESTUDIO_DB_USER=subtitle_studio`, `SUBTITLESTUDIO_DB_PASSWORD=...` (và `SUBTITLESTUDIO_DB_HOST` nếu không phải `localhost`).

## Cấu hình

| Thuộc tính | Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|---|
| `subtitle-studio.data-dir` | `SUBTITLESTUDIO_DATADIR` | `./data` | Thư mục chứa `subs/*.vtt` (và DB H2 dev) |
| `spring.profiles.active` | `SPRING_PROFILES_ACTIVE` | (trống = H2) | `oracle` để dùng Oracle |
| | `SUBTITLESTUDIO_DB_HOST` / `_USER` / `_PASSWORD` | `localhost` / bắt buộc / bắt buộc | Kết nối Oracle (profile `oracle`) |
| `subtitle-studio.ytdlp.path` | `SUBTITLESTUDIO_YTDLP_PATH` | `yt-dlp` | Đường dẫn tới yt-dlp |
| `subtitle-studio.ytdlp.timeout` | `SUBTITLESTUDIO_YTDLP_TIMEOUT` | `60s` | Quá thời gian thì dừng yt-dlp |
| `server.port` | `SERVER_PORT` | `8080` | Cổng HTTP |

## Phát triển

```bash
# Backend (cổng 8080)
mvn spring-boot:run

# Frontend có hot reload (cổng 5173, gọi /api sang 8080). Cần Node LTS.
cd frontend
npm install
npm run dev
```

| Lệnh | Việc |
|---|---|
| `mvn test` | Test backend (JUnit) và frontend (Vitest) |
| `mvn test -Dskip.npm` | Chỉ test backend |
| `cd frontend && npm test` | Chỉ test frontend |
| `mvn package` | Build jar có sẵn frontend bên trong |

Stack: Java 21, Spring Boot 3.5, Spring Data JPA + H2, React 19 + Vite + TypeScript.
Quy ước làm việc trong repo: [CLAUDE.md](CLAUDE.md). Tiến độ: [PROGRESS.md](PROGRESS.md).

## API

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/videos` | Body `{"url": "..."}`. 201 nếu mới lấy, 200 nếu đã có |
| GET | `/api/videos` | Danh sách video, mới nhất trước |
| GET | `/api/videos/{id}` | Thông tin một video |
| GET | `/api/videos/{id}/cues` | Danh sách câu phụ đề |
| GET | `/api/videos/{id}/subtitle.srt` | Tải file `.srt` (`?bom=true` để thêm BOM) |
| POST | `/api/videos/{id}/refresh` | Lấy lại phụ đề từ YouTube |
| DELETE | `/api/videos/{id}` | Xoá video, phụ đề (cả Vietsub) và file `.vtt` |
| POST | `/api/vietsub` | `multipart/form-data`: `url` (link hoặc mã video) + `file` (.srt tiếng Việt, tối đa 5 MB). Thêm hoặc thay Vietsub |
| GET | `/api/videos/{id}/vietsub` | Danh sách câu Vietsub `{startMs, endMs, text}` |
| GET | `/api/videos/{id}/subtitle.vi.srt` | Tải Vietsub đang lưu thành file `.vi.srt` (`?bom=true` để thêm BOM) |
| DELETE | `/api/videos/{id}/vietsub` | Xoá Vietsub |

Lỗi trả về dạng `application/problem+json` với field `code`: `INVALID_URL` (400), `NO_ENGLISH_SUBTITLE` (422), `VIDEO_NOT_FOUND` (404), `YTDLP_FAILED` (502), `YTDLP_TIMEOUT` (504), `INVALID_SRT` (400), `FILE_TOO_LARGE` (413), `NO_VIETSUB` (404), `INTERNAL_ERROR` (500).

## Khi gặp lỗi

- **`YTDLP_FAILED` với video vẫn xem được bình thường:** YouTube thay đổi thường xuyên, yt-dlp phải cập nhật theo.
  - Docker: tăng `YTDLP_VERSION` trong `Dockerfile` lên bản mới nhất rồi `docker compose up -d --build`.
  - Chạy trực tiếp: `yt-dlp -U` (hoặc `winget upgrade yt-dlp.yt-dlp`).
- **Video giới hạn tuổi, riêng tư hoặc chỉ dành cho hội viên:** chưa hỗ trợ (cần cookies), app sẽ báo `YTDLP_FAILED`.
- **`Could not start yt-dlp`:** yt-dlp chưa có trong `PATH`, hoặc đặt `SUBTITLESTUDIO_YTDLP_PATH` trỏ tới file chạy.

## Lưu ý bản quyền

Chỉ dùng cho mục đích cá nhân. Phụ đề thuộc về người đăng video; không công khai file phụ đề của video người khác. Thư mục `data/` đã nằm trong `.gitignore`, đừng commit nó.
