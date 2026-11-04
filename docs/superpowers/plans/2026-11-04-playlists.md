# Playlist cho video Vietsub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playlist có thứ tự cho video có Vietsub: quản lý ở menu Vietsub (Save to playlist, kéo thả), xem ở Vietsub list (search, khung playlist kiểu YouTube), và chế độ playlist ở trang xem (khung danh sách, Previous/Next, Autoplay).

**Architecture:** Backend package `playlist` (Flyway `V4`, entity `Playlist`/`PlaylistItem`, `PlaylistService`, `PlaylistController`); package `video` phát sự kiện khi gỡ Vietsub / xoá video để `PlaylistService` gỡ item (không phụ thuộc vòng). Frontend: client + trang `PlaylistsPage`, `PlaylistEditPage`, popover `SaveToPlaylist`, chips + search ở `VietsubListPage`, `PlaylistPanel` ở `WatchPage`.

**Tech Stack:** Spring Boot 3.5, Flyway (SQL Oracle + placeholder), React 19, `@radix-ui/react-popover` 1.3.1, `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0 + `@dnd-kit/utilities` 3.2.2.

**Spec:** [docs/superpowers/specs/2026-11-04-playlists-design.md](../specs/2026-11-04-playlists-design.md)

## Global Constraints

- Migration là `V4__playlists.sql` (SQL mục 3 của spec); kiểm tra lại số version so với `main` ngay trước khi merge.
- Cột chuỗi `VARCHAR2(n CHAR)`; số nguyên dùng `${bigint}`/`${int}`; id dùng `SEQUENCE` `allocationSize = 50`; Hibernate `validate`.
- Tên playlist `strip()`, 1..100 ký tự; mô tả `strip()` ≤ 1000, rỗng → `null`.
- `position` luôn liền mạch 1..n sau mọi thao tác.
- Mã lỗi: `PLAYLIST_NOT_FOUND` 404, `INVALID_PLAYLIST` 400 (+ `errors: [{field, message}]` như `INVALID_BLOCK`), `VIDEO_NOT_FOUND` 404, `VIDEO_HAS_NO_VIETSUB` 409, `INVALID_PLAYLIST_ORDER` 400.
- Chuỗi giao diện và thông điệp lỗi bằng tiếng Anh; nút chỉ có icon có `aria-label` + `<Tip>`; danh sách trống dùng `<EmptyState>`; xác nhận xoá dùng `useConfirmDialog`; thông báo dùng `toast` (sonner).
- Version package frontend cố định (không `^`).
- Route client mới phải có trong `SpaForwardController` (+ test).
- Lệnh: backend `mvn -q test -Dskip.npm`; frontend `cd frontend && npx vitest run > <file>` (ghi ra file, không pipe vào `head`) và `npx tsc --noEmit`.

## Review Focus

1. **Lưu thứ tự với danh sách cũ** (video vừa bị gỡ ở tab khác) → backend `INVALID_PLAYLIST_ORDER`; trang sửa tải lại playlist và báo lỗi, không kẹt ở thứ tự sai. (Task 7, `reloadsWhenOrderIsStale`)
2. **Bấm tick hai lần thật nhanh** trong hộp Save to playlist → không gửi request chồng; ô tick bị khoá trong lúc lưu. (Task 6, `disablesCheckboxWhileSaving`)
3. **Playlist trống / gỡ hết video** → không có ảnh bìa: danh sách playlist và khung đầu ở Vietsub list hiện ô thay thế, Play all bị ẩn. (Task 5, `emptyPlaylistHasNoCover`; Task 8, `emptyPlaylistHeaderHasNoPlayAll`)
4. **`?playlist=` trỏ tới playlist đã xoá** ở Vietsub list → coi như All, không lỗi. (Task 8, `unknownPlaylistFallsBackToAll`)
5. **Tìm kiếm có dấu / chữ `đ` / chữ Thái**: "cho dem" khớp "chợ đêm", "DEM" khớp "đêm", chữ Thái khớp chuỗi con nguyên văn. (Task 8, `lib/search.test.ts`)

---

### Task 1: Flyway `V4`, entity và repository

**Files:**
- Create: `src/main/resources/db/migration/V4__playlists.sql`, `src/main/java/com/subtitlestudio/playlist/Playlist.java`, `PlaylistItem.java`, `PlaylistRepository.java`, `PlaylistItemRepository.java`
- Test: `src/test/java/com/subtitlestudio/video/FlywaySchemaTest.java`, `src/test/java/com/subtitlestudio/playlist/PlaylistRepositoryTest.java`, `src/test/java/com/subtitlestudio/oracle/PersistenceOracleIT.java`

**Interfaces:**
- Produces: `Playlist(String name, String description, Instant at)`; getters `getId()`, `getName()`, `getDescription()`, `getCreatedAt()`, `getUpdatedAt()`; `void rename(String name, String description, Instant at)`; `void touch(Instant at)`. `PlaylistItem(Playlist playlist, Video video, int position)`; `getPlaylist()`, `getVideo()`, `getPosition()`, `void moveTo(int position)`. `PlaylistRepository extends JpaRepository<Playlist, Long>` + `List<Playlist> findAllByOrderByUpdatedAtDesc()`. `PlaylistItemRepository extends JpaRepository<PlaylistItem, Long>` + `List<PlaylistItem> findByPlaylist_IdOrderByPositionAsc(Long playlistId)`, `Optional<PlaylistItem> findByPlaylist_IdAndVideo_Id(Long playlistId, String videoId)`, `List<PlaylistItem> findByVideo_Id(String videoId)`, `long countByPlaylist_Id(Long playlistId)`, `@Modifying(flushAutomatically = true, clearAutomatically = true) int deleteByPlaylistId(Long id)` (JPQL `delete from PlaylistItem i where i.playlist.id = :id`).

- [ ] **Step 1: Test thất bại** — `FlywaySchemaTest.appliesV4Migration` (version '4' thành công); thêm `PLAYLIST_SEQ`, `PLAYLIST_ITEM_SEQ` vào `sequencesIncrementBy50`; `PlaylistRepositoryTest` (`@DataJpaTest` + `Replace.NONE` + profile test): `savesPlaylistWithItemsInOrder`, `rejectsSameVideoTwiceInOnePlaylist` (`DataIntegrityViolationException`), `listsNewestUpdatedFirst`, `findsItemsByVideo`; `PersistenceOracleIT.onlyFlywayCreatesTables` thêm `PLAYLIST`, `PLAYLIST_ITEM` (danh sách đúng thứ tự tên bảng).
- [ ] **Step 2: Chạy** `mvn -q test -Dskip.npm -Dtest='FlywaySchemaTest,PlaylistRepositoryTest'` → FAIL.
- [ ] **Step 3: Cài đặt** migration đúng spec mục 3; entity theo quy ước `CueEntity` (sequence `playlist_seq`, `playlist_item_seq`).
- [ ] **Step 4: Chạy** `mvn -q test -Dskip.npm` → BUILD SUCCESS.
- [ ] **Step 5: Commit** — `git commit -m "Add playlist tables (Flyway V4) with entities and repositories"`

---

### Task 2: `PlaylistService`

**Files:**
- Create: `playlist/PlaylistService.java`, `playlist/PlaylistSummary.java`, `playlist/PlaylistDetail.java`, `playlist/PlaylistNotFoundException.java`, `playlist/InvalidPlaylistException.java`, `playlist/VideoHasNoVietsubException.java`, `playlist/InvalidPlaylistOrderException.java`
- Modify: `video/VideoDto.java` (`from` thành `public static`)
- Test: `playlist/PlaylistServiceTest.java`

**Interfaces:**
- Consumes: Task 1; `VideoRepository`, `VideoDto.from(Video)`, `com.subtitlestudio.profile.FieldError`, `Clock`.
- Produces:
  - `record PlaylistSummary(long id, String name, String description, int videoCount, String thumbnailUrl, Instant updatedAt, @JsonInclude(NON_NULL) Boolean containsVideo)`
  - `record PlaylistDetail(long id, String name, String description, Instant updatedAt, List<VideoDto> videos)`
  - `PlaylistService`: `List<PlaylistSummary> list(String videoIdOrNull)`, `PlaylistDetail create(String name, String description)`, `PlaylistDetail get(long id)`, `PlaylistDetail update(long id, String name, String description)` (tham số `null` = giữ nguyên), `void delete(long id)`, `PlaylistDetail addVideo(long id, String videoId)`, `void removeVideo(long id, String videoId)`, `PlaylistDetail reorder(long id, List<String> videoIds)`, `void removeVideoEverywhere(String videoId)`.
  - `InvalidPlaylistException(List<FieldError> errors)` + `errors()`.

- [ ] **Step 1: Test thất bại** (`@DataJpaTest` + `Replace.NONE`, `MutableClock`):
  - `createTrimsAndStores`, `createRejectsBlankOrTooLongName` (field `name`), `createRejectsTooLongDescription` (field `description`), `blankDescriptionBecomesNull`.
  - `listNewestUpdatedFirstWithCountAndThumbnail` (`thumbnailUrl` của video ở position 1; trống → `null`), `listMarksContainsVideo` (chỉ có khi truyền `videoId`).
  - `addVideoAppendsAtEnd`, `addVideoTwiceKeepsPosition`, `addVideoWithoutVietsubIs409` (`VideoHasNoVietsubException`), `addUnknownVideoThrowsNotFound`, `unknownPlaylistThrowsNotFound`.
  - `removeVideoClosesTheGap` (1,2,3 gỡ 2 → 1,2), `removeMissingVideoIsNoop`.
  - `reorderSetsPositions`, `reorderRejectsMissingExtraOrDuplicate` (3 trường hợp → `InvalidPlaylistOrderException`).
  - `updateRenamesAndKeepsNullFields`, `everyChangeBumpsUpdatedAt` (đổi tên, thêm, gỡ, sắp xếp; clock tiến 1 phút mỗi lần).
  - `deleteKeepsVideos`, `removeVideoEverywhereClosesGapsAndBumpsUpdatedAt` (video ở 2 playlist).
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài đặt** (mọi thao tác ghi trong `@Transactional`; ghi lại `position` 1..n bằng `moveTo` theo thứ tự mới).
- [ ] **Step 4: Chạy** `mvn -q test -Dskip.npm` → BUILD SUCCESS.
- [ ] **Step 5: Commit** — `git commit -m "Playlist service: CRUD, add/remove, ordered positions"`

---

### Task 3: Gỡ khỏi playlist khi gỡ Vietsub / xoá video

**Files:**
- Create: `video/VideoRemovalEvent.java` (`record VideoRemovalEvent(String videoId)`)
- Modify: `video/VietsubService.java` (`clear`), `video/SubtitleService.java` (`delete`), `playlist/PlaylistService.java`
- Test: `playlist/PlaylistCleanupTest.java`

**Interfaces:**
- Produces: `VietsubService.clear` và `SubtitleService.delete` phát `VideoRemovalEvent` **bên trong** transaction, trước khi xoá `video` (FK); `PlaylistService` có `@EventListener void on(VideoRemovalEvent e)` gọi `removeVideoEverywhere(e.videoId())`.

- [ ] **Step 1: Test thất bại** (`@DataJpaTest` import `VietsubService`, `SubtitleService` (mock `YtDlpClient`), `PlaylistService`, ...): `clearingVietsubRemovesVideoFromPlaylists`, `deletingVideoRemovesItFromPlaylistsWithoutFkError`.
- [ ] **Step 2: Chạy** → FAIL (item còn / lỗi khoá ngoại).
- [ ] **Step 3: Cài đặt** (inject `ApplicationEventPublisher`).
- [ ] **Step 4: Chạy** `mvn -q test -Dskip.npm` → BUILD SUCCESS.
- [ ] **Step 5: Commit** — `git commit -m "Remove videos from playlists when their Vietsub or the video is deleted"`

---

### Task 4: `PlaylistController`, mã lỗi, route SPA

**Files:**
- Create: `playlist/PlaylistController.java`, `playlist/PlaylistRequest.java` (`record PlaylistRequest(String name, String description)`), `playlist/AddVideoRequest.java` (`record AddVideoRequest(String videoId)`), `playlist/OrderRequest.java` (`record OrderRequest(List<String> videoIds)`)
- Modify: `web/ApiExceptionHandler.java`, `web/SpaForwardController.java` (thêm `"/vietsub/playlists/{id}"`, `"/vietsub/playlists/{id}/"`)
- Test: `playlist/PlaylistControllerTest.java`, `web/SpaForwardControllerTest.java`

**Interfaces:**
- Consumes: Task 2.
- Produces: endpoint đúng bảng spec mục 4 (POST tạo → 201; DELETE → 204).

- [ ] **Step 1: Test thất bại** (`@WebMvcTest`, mock service): mỗi endpoint trả đúng status/JSON; `containsVideo` vắng khi không truyền `videoId`; `INVALID_PLAYLIST` 400 có `errors[0].field == "name"`; 404 `PLAYLIST_NOT_FOUND`; 409 `VIDEO_HAS_NO_VIETSUB`; 400 `INVALID_PLAYLIST_ORDER`; `SpaForwardControllerTest`: `/vietsub/playlists` và `/vietsub/playlists/12` forward `index.html`.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài đặt**.
- [ ] **Step 4: Chạy** `mvn -q test -Dskip.npm` → BUILD SUCCESS.
- [ ] **Step 5: Commit** — `git commit -m "Playlist API and error codes"`

---

### Task 5: Frontend — client, tab Videos | Playlists, trang danh sách playlist

**Files:**
- Modify: `frontend/src/api/client.ts`, `frontend/src/lib/errors.ts`, `frontend/src/components/NavBar.tsx`, `frontend/src/App.tsx`, `frontend/src/pages/VietsubPage.tsx`, `frontend/src/styles.css`
- Create: `frontend/src/components/VietsubTabs.tsx`, `frontend/src/pages/PlaylistsPage.tsx`
- Test: `frontend/src/pages/PlaylistsPage.test.tsx`, `frontend/src/components/NavBar.test.tsx`, `frontend/src/lib/errors.test.ts`

**Interfaces:**
- Produces (`client.ts`): `interface PlaylistSummary { id: number; name: string; description: string | null; videoCount: number; thumbnailUrl: string | null; updatedAt: string; containsVideo?: boolean }`; `interface PlaylistDetail { id: number; name: string; description: string | null; updatedAt: string; videos: VideoDto[] }`; `listPlaylists(videoId?: string): Promise<PlaylistSummary[]>`, `createPlaylist(name: string, description?: string): Promise<PlaylistDetail>`, `getPlaylist(id: number): Promise<PlaylistDetail>`, `updatePlaylist(id: number, patch: { name?: string; description?: string }): Promise<PlaylistDetail>`, `deletePlaylist(id: number): Promise<void>`, `addToPlaylist(id: number, videoId: string): Promise<PlaylistDetail>`, `removeFromPlaylist(id: number, videoId: string): Promise<void>`, `reorderPlaylist(id: number, videoIds: string[]): Promise<PlaylistDetail>`. `VietsubTabs()` — nav `aria-label="Vietsub"` với link **Videos** (`/vietsub`) và **Playlists** (`/vietsub/playlists`), `aria-current` cho tab hiện tại.
- Routes trong `App.tsx`: `/vietsub/playlists` → `PlaylistsPage`, `/vietsub/playlists/:playlistId` → `PlaylistEditPage` (Task 7; tạm placeholder nếu chưa có thì Task 7 thay).
- NavBar: **Vietsub** hiện tại cho `/vietsub` và mọi `/vietsub/playlists…`; **Vietsub list** cho `/vietsub/list` và `/vietsub/:id` trừ `playlists`.

- [ ] **Step 1: Test thất bại**:
  - `NavBar.test`: `/vietsub/playlists` và `/vietsub/playlists/3` → Vietsub `aria-current`; `/vietsub/abc` → Vietsub list.
  - `errors.test`: 4 mã mới có thông điệp tiếng Anh (`PLAYLIST_NOT_FOUND` "This playlist no longer exists.", `INVALID_PLAYLIST` "Check the playlist name and description.", `VIDEO_HAS_NO_VIETSUB` "Only videos with Vietsub can be added to a playlist.", `INVALID_PLAYLIST_ORDER` "The playlist changed meanwhile. It has been reloaded.").
  - `PlaylistsPage.test`: `showsTabsWithPlaylistsCurrent`; `listsPlaylistsWithCoverCountAndEditLink` (link Edit → `/vietsub/playlists/1`); `emptyPlaylistHasNoCover` (ô thay thế, không có `img`); `createsPlaylistFromForm` (POST body `{"name":"VLOG","description":"..."}`, playlist mới đứng đầu); `showsFieldErrorFromServer` (400 `INVALID_PLAYLIST` + `errors` → thông báo ở ô tên); `deletesAfterConfirm` / `keepsWhenCancelled` (`answerConfirm`); `emptyStateWhenNoPlaylists`.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài đặt**; `VietsubPage` hiển thị `VietsubTabs` dưới tiêu đề.
- [ ] **Step 4: Chạy** vitest + tsc → pass.
- [ ] **Step 5: Commit** — `git commit -m "Frontend: playlist client, Videos/Playlists tabs, playlists page"`

---

### Task 6: Popover "Save to playlist" ở Manage Vietsub

**Files:**
- Modify: `frontend/package.json` (`@radix-ui/react-popover` 1.3.1), `frontend/src/components/VietsubList.tsx`
- Create: `frontend/src/components/SaveToPlaylist.tsx`
- Test: `frontend/src/components/SaveToPlaylist.test.tsx`, `frontend/src/pages/VietsubPage.test.tsx`

**Interfaces:**
- Consumes: Task 5 client.
- Produces: `SaveToPlaylist({ video }: { video: VideoDto })` — nút icon (`ListPlus`, `aria-label="Save to playlist: <title>"`, `<Tip label="Save to playlist">`) mở popover; khi mở gọi `listPlaylists(video.id)`.

- [ ] **Step 1: Test thất bại**: `listsPlaylistsWithCheckedState`; `tickAddsAndToasts` ("Saved to VLOG"); `untickRemovesAndToasts` ("Removed from VLOG"); `disablesCheckboxWhileSaving` (request treo → ô `disabled`, bấm lần hai không gửi thêm); `createsPlaylistAndAddsVideo` (gõ tên + Enter → POST tạo rồi POST thêm video, ô mới đã tick); `showsErrorOnFailure` (409 → thông điệp `VIDEO_HAS_NO_VIETSUB`, ô trở lại trạng thái cũ); `VietsubPage.test`: mỗi dòng Manage Vietsub có nút Save to playlist kèm tooltip.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài đặt** (popover `side="bottom" align="end"`, Esc/bấm ngoài đóng; CSS dùng token sẵn có).
- [ ] **Step 4: Chạy** vitest + tsc → pass.
- [ ] **Step 5: Commit** — `git commit -m "Save to playlist popover in Manage Vietsub"`

---

### Task 7: Trang sửa playlist (kéo thả, ↑ ↓, gỡ, đổi tên, xoá)

**Files:**
- Modify: `frontend/package.json` (`@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2), `frontend/src/App.tsx`
- Create: `frontend/src/pages/PlaylistEditPage.tsx`
- Test: `frontend/src/pages/PlaylistEditPage.test.tsx`

**Interfaces:**
- Consumes: Task 5 client, `useConfirmDialog`, `toast`.
- Produces: route `/vietsub/playlists/:playlistId`; nút **Play all** là link `/vietsub/<id video đầu>?playlist=<playlistId>`.

- [ ] **Step 1: Test thất bại**: `showsNumberedVideosInOrder` (1., 2., 3.); `renamesInPlace` (PATCH `{"name":"Mới"}`); `movesDownWithButton` (PUT order mới, số thứ tự cập nhật); `moveUpDisabledForFirst` / `moveDownDisabledForLast`; `dragsWithKeyboard` (focus tay nắm → Space → ArrowDown → Space → PUT order); `restoresOrderWhenSaveFails` (500 → thứ tự cũ + alert); `reloadsWhenOrderIsStale` (400 `INVALID_PLAYLIST_ORDER` → GET lại + alert "The playlist changed meanwhile…"); `removesVideo` (DELETE, số thứ tự dồn); `deletesPlaylistAfterConfirm` (→ điều hướng `/vietsub/playlists`); `playAllLinksToFirstVideo`; `emptyPlaylistShowsHint` (EmptyState, không có Play all); `unknownPlaylistShowsNotFound` (404 → thông điệp + link về Playlists).
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài đặt** (`DndContext` + `SortableContext` + `KeyboardSensor` với `sortableKeyboardCoordinates`; cập nhật lạc quan rồi PUT; ↑ ↓ dùng cùng hàm lưu).
- [ ] **Step 4: Chạy** vitest + tsc → pass.
- [ ] **Step 5: Commit** — `git commit -m "Playlist editor: drag and drop order, rename, remove, delete"`

---

### Task 8: Vietsub list — search, chips, khung playlist

**Files:**
- Create: `frontend/src/lib/search.ts`, `frontend/src/components/PlaylistChips.tsx`, `frontend/src/components/PlaylistHeader.tsx`
- Modify: `frontend/src/pages/VietsubListPage.tsx`, `frontend/src/styles.css`
- Test: `frontend/src/lib/search.test.ts`, `frontend/src/pages/VietsubListPage.test.tsx`

**Interfaces:**
- Produces: `normalizeForSearch(text: string): string` (lowercase, NFD bỏ dấu kết hợp, `đ`→`d`); `matchesSearch(video: VideoDto, query: string): boolean` (title hoặc channel chứa query đã chuẩn hoá; query rỗng → true). URL params: `playlist`, `q`, `page`.

- [ ] **Step 1: Test thất bại**:
  - `search.test`: `ignoresCaseAndVietnameseMarks` ("cho dem" ↔ "Chợ Đêm"), `mapsDStroke` ("DEM" ↔ "đêm"), `matchesChannel`, `matchesThaiSubstring` ("ตลาด" ↔ "ตะลุยกินแหลกตลาด"), `emptyQueryMatchesAll`.
  - `VietsubListPage.test`: `showsAllChipWithCountAndPlaylistChips`; `searchFiltersAllAndKeepsQInUrl` (`?q=`); `noMatchShowsEmptyState` ('No videos match "zzz"'); `selectingPlaylistShowsHeaderAndNumberedOrder` (khung: tên, "3 videos", Play all → `/vietsub/<first>?playlist=1`; dòng đánh số 1..3; link dòng có `?playlist=1`); `searchInsidePlaylistKeepsOriginalNumbers` (#2 và #3 còn lại); `emptyPlaylistHeaderHasNoPlayAll`; `unknownPlaylistFallsBackToAll` (`?playlist=999`); `changingPlaylistOrQueryResetsPage`; `allRowsLinkWithoutPlaylistParam`.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài đặt** (tải `listVideos()` + `listPlaylists()`; khi chọn playlist gọi `getPlaylist(id)`; phân trang qua `usePagination` sẵn có).
- [ ] **Step 4: Chạy** vitest + tsc → pass.
- [ ] **Step 5: Commit** — `git commit -m "Vietsub list: search, playlist chips and YouTube-like playlist header"`

---

### Task 9: Trang xem ở chế độ playlist

**Files:**
- Modify: `frontend/src/player/useYouTubePlayer.ts` (tham số `options?: { autoplay?: boolean }` → `playerVars.autoplay = 1`), `frontend/src/pages/WatchPage.tsx`, `frontend/src/styles.css`
- Create: `frontend/src/components/PlaylistPanel.tsx`
- Test: `frontend/src/pages/WatchPage.test.tsx`, `frontend/src/components/PlaylistPanel.test.tsx`

**Interfaces:**
- Consumes: `getPlaylist`, `useYouTubePlayer(container, videoId, { autoplay })` (state `'ended'` đã có).
- Produces: `PlaylistPanel({ playlist, currentId, autoplay, onAutoplayChange, onSelect })`; `localStorage` key `subtitle-studio.autoplay` (mặc định bật, try/catch); chuyển video bằng `navigate('/vietsub/<id>?playlist=<pid>', { state: { autoplay: true } })`; `WatchPage` truyền `autoplay` = `location.state?.autoplay === true`.

- [ ] **Step 1: Test thất bại** (player YouTube giả như test hiện có):
  - `PlaylistPanel.test`: `highlightsCurrentWithPosition` ("2 / 3", dòng hiện tại `aria-current`); `previousDisabledOnFirst` / `nextDisabledOnLast`; `autoplaySwitchReflectsAndToggles`.
  - `WatchPage.test`: `noPanelWithoutPlaylistParam`; `showsPanelInPlaylistMode`; `nextAndPreviousNavigateKeepingPlaylist`; `endedWithAutoplayGoesToNext` (giả lập state ENDED → URL video kế tiếp, `autoplay` = true cho player mới); `endedWithAutoplayOffStays`; `endOfPlaylistStops` (video cuối ENDED → "End of playlist", không điều hướng); `shiftNAndShiftPNavigate` (bỏ qua khi focus trong `input`); `unknownPlaylistOrVideoNotInItShowsNormalPage`; `autoplayChoiceIsRemembered`.
- [ ] **Step 2: Chạy** → FAIL.
- [ ] **Step 3: Cài đặt** (khung bên phải ≥ 761px, dưới player ≤ 760px; cuộn dòng hiện tại vào tầm nhìn bằng `scrollIntoView({ block: 'nearest' })`).
- [ ] **Step 4: Chạy** vitest + tsc → pass.
- [ ] **Step 5: Commit** — `git commit -m "Watch page playlist mode: panel, previous/next, autoplay"`

---

### Task 10: Tài liệu, test Oracle, kiểm tra tay (cùng người dùng)

**Files:**
- Modify: `README.md` (mục Playlist + bảng API), `CLAUDE.md` (`position` liền mạch 1..n; route client mới vào `SpaForwardController`; sự kiện `VideoRemovalEvent`), `PROGRESS.md` (nhật ký)

- [ ] **Step 1: Docs** như trên.
- [ ] **Step 2: Toàn bộ test** — `mvn -q clean test -Dskip.npm`, vitest, tsc, và (nếu Docker ổn) `mvn verify -Poracle -Dskip.npm` → tất cả pass.
- [ ] **Step 3: Kiểm tra số migration** so với `main` (không trùng `V4`); merge `main` vào nhánh nếu `main` đã tiến.
- [ ] **Step 4: Commit** — `git commit -m "Docs: playlists"`
- [ ] **Step 5: Khi người dùng đồng ý** — merge, `docker compose up -d --build`, kiểm tra tay: tạo 2 playlist từ video thật, kéo thả bằng chuột, Play all, tự phát qua 2 video (cả khi toàn màn hình).
