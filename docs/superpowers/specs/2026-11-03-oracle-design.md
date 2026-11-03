# Oracle và nền tảng dữ liệu (design spec)

> Ngày: 2026-11-03. Trạng thái: chờ review.
> Dự án con 1/2 của hướng "mở rộng nhiều người dùng". Dự án con 2 (tài khoản, dữ liệu theo người dùng) có spec riêng sau.
> Nền tảng: Phase 1 + Phase 2 trên `main` (xem [PROGRESS.md](../../../PROGRESS.md)).

## 1. Mục tiêu

Chuyển database chạy hằng ngày của app sang **Oracle**, quản lý schema bằng **migration có version**, và kiểm thử trên Oracle thật, để:

- người dùng có kinh nghiệm thực tế với Oracle (DDL, vận hành, công cụ);
- app có nền dữ liệu đủ chắc để sau này thêm nhiều người dùng chỉ bằng migration mới.

**Tiêu chí thành công:**
1. `docker compose up -d` dựng Oracle + app; mọi chức năng hiện tại (Lấy Engsub, Vietsub, xem, tải `.srt`, phân trang) chạy đúng trên Oracle.
2. Schema do Flyway tạo từ `V1__init.sql` (SQL Oracle); Hibernate chỉ `validate`.
3. `mvn test` vẫn chạy nhanh trên H2 và đi qua chính các script Flyway.
4. `mvn verify -Poracle` chạy nhóm test trên Oracle thật (Testcontainers) và pass.
5. Kết nối được bằng SQL Developer / DBeaver vào `localhost:1521/FREEPDB1` với user `subtitle_studio`.

**Ngoài phạm vi:** tài khoản người dùng, đăng nhập, dữ liệu theo người dùng (dự án con 2); chặn import trùng khi request đồng thời (Backlog); công cụ chuyển dữ liệu H2 → Oracle; deploy lên server/cloud.

## 2. Quyết định đã chốt với người dùng

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **Oracle là mặc định khi chạy `docker compose`**; H2 cho test và dev nhanh (`mvn spring-boot:run`) | Dùng Oracle mỗi ngày mới có kinh nghiệm thật |
| D2 | **Bắt đầu dữ liệu mới trên Oracle**: tải `.vi.srt` của các video có Vietsub, rồi thêm lại qua giao diện | Chỉ 4 video; không cần viết công cụ chuyển dữ liệu |
| D3 | **Flyway, một bộ script SQL Oracle**; H2 chạy `MODE=Oracle` để dùng chung script; Hibernate `ddl-auto: validate` | Luyện DDL Oracle; một nguồn sự thật cho schema |
| D4 | **Test trên Oracle thật bằng Testcontainers, chạy khi cần** (`mvn verify -Poracle`); `mvn test` vẫn dùng H2 | Giữ vòng lặp dev nhanh; bắt lỗi riêng của Oracle |
| D5 | **Spring profile**: `application.yml` (chung, mặc định H2) + `application-oracle.yml` | Cách chuẩn của Spring Boot; dễ thêm profile `prod` về sau |

## 3. Docker và Oracle

`docker-compose.yml` có 2 service:

| Service | Cấu hình |
|---|---|
| `oracle` | Image `gvenzl/oracle-free`, biến thể `slim-faststart`, **pin tag cụ thể** (chọn tag 23ai mới nhất trên Docker Hub lúc implement, ghi vào compose và test). Biến `ORACLE_PASSWORD`, `APP_USER=subtitle_studio`, `APP_USER_PASSWORD` lấy từ `.env`. Healthcheck bằng `healthcheck.sh` có sẵn trong image. Cổng `127.0.0.1:1521:1521`. Dữ liệu ở **named volume `oracle-data`** (`/opt/oracle/oradata`). |
| `subtitle-studio` | Như hiện tại + `SPRING_PROFILES_ACTIVE=oracle`, `SUBTITLESTUDIO_DB_HOST=oracle`, `SUBTITLESTUDIO_DB_USER`, `SUBTITLESTUDIO_DB_PASSWORD` (từ `.env`). `depends_on: oracle: condition: service_healthy`. Vẫn mount `./data:/data` (chỉ còn dùng cho `subs/*.vtt`). |

- **`.env`** vào `.gitignore`; repo có **`.env.example`**. Các biến mật khẩu trong compose dùng cú pháp `${VAR:?thông báo}` để thiếu là báo lỗi ngay, không có mật khẩu mặc định.
- Không dùng bind mount cho dữ liệu Oracle: Oracle chạy bằng uid 54321, bind mount trên Windows dễ lỗi quyền.
- Oracle Free tự giới hạn 2 CPU / 2 GB RAM.

## 4. Schema và Flyway

**Thư viện:** `flyway-core`, `flyway-database-oracle` (version theo Spring Boot BOM).

**`src/main/resources/db/migration/V1__init.sql`** (SQL Oracle):

```sql
CREATE TABLE video (
  id            VARCHAR2(11 CHAR)   NOT NULL,
  title         VARCHAR2(500 CHAR)  NOT NULL,
  channel       VARCHAR2(255 CHAR),
  duration_sec  NUMBER(10),
  sub_lang      VARCHAR2(16 CHAR)   NOT NULL,
  sub_source    VARCHAR2(10 CHAR)   NOT NULL,
  cue_count     NUMBER(10)          NOT NULL,
  fetched_at    TIMESTAMP(6) WITH TIME ZONE NOT NULL,
  vi_cue_count  NUMBER(10) DEFAULT 0 NOT NULL,
  vi_updated_at TIMESTAMP(6) WITH TIME ZONE,
  CONSTRAINT pk_video PRIMARY KEY (id),
  CONSTRAINT ck_video_sub_source CHECK (sub_source IN ('MANUAL', 'AUTO'))
);

CREATE SEQUENCE cue_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE cue (
  id        NUMBER(19)          NOT NULL,
  video_id  VARCHAR2(11 CHAR)   NOT NULL,
  idx       NUMBER(10)          NOT NULL,
  start_ms  NUMBER(19)          NOT NULL,
  end_ms    NUMBER(19)          NOT NULL,
  text_en   VARCHAR2(1000 CHAR) NOT NULL,
  text_vi   VARCHAR2(1000 CHAR),
  CONSTRAINT pk_cue PRIMARY KEY (id),
  CONSTRAINT fk_cue_video FOREIGN KEY (video_id) REFERENCES video (id),
  CONSTRAINT uk_cue_video_idx UNIQUE (video_id, idx)
);

CREATE SEQUENCE vi_cue_seq START WITH 1 INCREMENT BY 50;
CREATE TABLE vi_cue (
  id        NUMBER(19)          NOT NULL,
  video_id  VARCHAR2(11 CHAR)   NOT NULL,
  idx       NUMBER(10)          NOT NULL,
  start_ms  NUMBER(19)          NOT NULL,
  end_ms    NUMBER(19)          NOT NULL,
  text      VARCHAR2(1000 CHAR) NOT NULL,
  CONSTRAINT pk_vi_cue PRIMARY KEY (id),
  CONSTRAINT fk_vi_cue_video FOREIGN KEY (video_id) REFERENCES video (id),
  CONSTRAINT uk_vi_cue_video_idx UNIQUE (video_id, idx)
);
```

Kiểu cột chính xác (ví dụ kiểu Hibernate kỳ vọng cho `Instant` và `int`) được chốt khi implement sao cho `validate` pass trên **cả** H2 `MODE=Oracle` lẫn Oracle thật; mọi điều chỉnh ghi vào nhật ký PROGRESS.

**Quyết định Oracle:**
1. **`VARCHAR2(n CHAR)`** ở mọi cột chuỗi: mặc định Oracle đếm byte, tiêu đề tiếng Thái (~3 byte/ký tự) sẽ vượt `VARCHAR2(500)`.
2. **`SEQUENCE` thay `IDENTITY`** cho `cue`/`vi_cue` (`INCREMENT BY 50` khớp `allocationSize = 50`) để Hibernate batch insert hàng nghìn câu.
3. **Không tạo index riêng cho `video_id`**: index của `UNIQUE (video_id, idx)` có `video_id` đứng đầu nên dùng được cho truy vấn và khoá ngoại.
4. Khoá ngoại **không** `ON DELETE CASCADE`: app đã xoá `vi_cue` → `cue` → `video` theo thứ tự trong service; giữ hành vi này.

**Quy tắc migration:** không sửa file đã chạy; mọi thay đổi là file mới `V{n}__mo_ta.sql`.

**H2:** URL dev `jdbc:h2:file:${subtitle-studio.data-dir}/dev;MODE=Oracle;AUTO_SERVER=TRUE` (file mới `./data/dev.mv.db`). File H2 cũ `./data/subtitle-studio.mv.db` (do Hibernate tạo, Flyway không nhận) **giữ nguyên, không xoá**.

## 5. Thay đổi trong code

**`pom.xml`:** `com.oracle.database.jdbc:ojdbc11` (runtime); `flyway-core`, `flyway-database-oracle`; `org.testcontainers:oracle-free`, `org.testcontainers:junit-jupiter`, `spring-boot-testcontainers` (test); `maven-failsafe-plugin` trong profile Maven `oracle`, chạy `**/*OracleIT.java`; surefire loại trừ `*OracleIT`.

**Cấu hình:**

| File | Nội dung |
|---|---|
| `application.yml` | Datasource H2 như mục 4; `spring.jpa.hibernate.ddl-auto: validate`; `spring.jpa.properties.hibernate.jdbc.batch_size: 100`, `order_inserts: true`; Flyway bật (mặc định) |
| `application-oracle.yml` | `url: jdbc:oracle:thin:@//${SUBTITLESTUDIO_DB_HOST:localhost}:1521/FREEPDB1`, `username: ${SUBTITLESTUDIO_DB_USER}`, `password: ${SUBTITLESTUDIO_DB_PASSWORD}` (không mặc định → thiếu thì lỗi khi khởi động); Hikari `maximum-pool-size`, `connection-timeout` |
| `application-test.yml` | H2 in-memory `MODE=Oracle`; Flyway chạy như thật |

**Entity:**
- `CueEntity`, `ViCueEntity`: `@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = …)` + `@SequenceGenerator(sequenceName = "cue_seq" | "vi_cue_seq", allocationSize = 50)`.
- `Video`: bỏ `columnDefinition` của `viCueCount` (schema thuộc về Flyway).

**Bẫy "chuỗi rỗng = NULL" của Oracle:**
- Tiêu đề rỗng/blank từ yt-dlp → dùng videoId làm tiêu đề (trong `VideoInfoParser`).
- `CaptionNormalizer` và `SrtParser`: đảm bảo câu có text rỗng sau trim bị bỏ, không lưu; bổ sung test nếu chưa có.
- `channel` cho phép NULL: không cần xử lý.

**Không đổi:** REST API, frontend, luồng yt-dlp, `./data/subs`, repository (2 câu JPQL `delete` dùng được trên cả hai DB).

## 6. Kiểm thử

**`mvn test` (H2 `MODE=Oracle`):**
- Toàn bộ test hiện có pass với schema do Flyway tạo.
- `@DataJpaTest` thêm `@AutoConfigureTestDatabase(replace = Replace.NONE)` để dùng đúng URL `MODE=Oracle` thay vì H2 thuần do Spring tự thay.
- Test mới: tiêu đề rỗng → videoId; câu rỗng bị bỏ (normalizer, SrtParser).
- Context load với `validate` là bằng chứng entity khớp schema.

**`mvn verify -Poracle` (Oracle thật, Testcontainers, cùng tag image với compose, `@ServiceConnection`):**

| Test | Kiểm tra |
|---|---|
| Khởi động context | Flyway `V1` chạy được trên Oracle; `validate` pass |
| Tiêu đề tiếng Thái 500 ký tự | `VARCHAR2(n CHAR)` |
| Lưu + đọc ~3.200 câu | Batch insert với sequence, thứ tự `idx`, thời gian |
| Xoá video có Engsub + Vietsub | Thứ tự xoá theo khoá ngoại |
| Đọc lại `Instant` | Độ chính xác micro giây, múi giờ |
| Tiêu đề/câu rỗng | `'' = NULL` trên Oracle thật |

Bước build trong `Dockerfile` (`mvn package`) **không** chạy nhóm này (không có Docker bên trong build).

**Kiểm tra tay:** compose up → Oracle healthy → app lên; lấy Engsub video thật; upload Vietsub; xem; restart container, dữ liệu còn; kết nối SQL Developer/DBeaver xem bảng.

## 7. Vận hành và chuyển đổi

**Chuyển sang Oracle (D2):**
1. Trên app hiện tại: Download Vietsub cho các video có Vietsub; ghi lại link của mọi video.
2. `docker compose down`.
3. `cp .env.example .env`, đặt mật khẩu.
4. `docker compose up -d --build` (lần đầu tải image Oracle).
5. Thêm lại các video và upload lại `.vi.srt`.

**Sao lưu:**
- Chính (nguội): `docker compose down` → `docker run --rm -v subtitle-studio_oracle-data:/src -v <thư mục backup>:/backup alpine tar czf /backup/oracle-data-<ngày>.tgz -C /src .` → `docker compose up -d`. Khôi phục: giải nén ngược vào volume rỗng.
- Tham khảo (luyện tập): lệnh Data Pump `expdp` xuất schema `subtitle_studio`, ghi trong README.

**Tài liệu:** README (chạy với Oracle, `.env`, kết nối công cụ SQL, sao lưu/khôi phục, dev bằng H2); CLAUDE.md (`mvn verify -Poracle`, quy tắc migration, quy tắc `VARCHAR2(n CHAR)`); PROGRESS.md (nhật ký, quyết định).

## 8. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| H2 `MODE=Oracle` khác Oracle thật | Nhóm `*OracleIT` trên Oracle thật |
| Kiểu cột Hibernate kỳ vọng khác giữa H2 và Oracle khiến `validate` fail ở một bên | Chốt kiểu cột khi implement bằng cách chạy cả `mvn test` và `mvn verify -Poracle`; ghi lại điều chỉnh |
| Image Oracle nặng, tải lâu lần đầu | Tải một lần; nằm trên ổ D |
| Oracle khởi động chậm | `depends_on: service_healthy`; biến thể `faststart` |
| Quên mật khẩu `.env` | `.env.example` + hướng dẫn README; mất mật khẩu thì đặt lại qua `docker exec … resetPassword` (ghi trong README) |
