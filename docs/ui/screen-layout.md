# Screen Layout Guidelines

Bắt buộc cho **mọi màn hình mới hoặc màn hình sửa lại** của Subtitle Studio (admin và public). Nguồn gốc và số đo:
[spec 2026-11-13](../superpowers/specs/2026-11-13-ui-consistency-design.md). Màu, cỡ nút, ô nhập xem `CLAUDE.md` ›
Frontend; tài liệu này chỉ quy định **cấu trúc trang**.

## 1. Khung chuẩn (Master Layout)

```
Topbar
┌──────────────────────────────────────────────────────────────┐
│ Breadcrumbs   Novels › Be My Sugar! › Chapter 3   (cấp ≥ 2)   │  điện thoại: "← Be My Sugar!"
│ H1 Tiêu đề                              [Phụ] [Chính]         │  bắt buộc
│ Lede (tuỳ chọn)                                               │
│ Tabs (tuỳ chọn)                                               │
│ Toolbar: [Tìm][Pills][Sort ▾] ·············· [Hành động tab] │  trang danh sách
│ Nội dung (các section cách nhau 48 px)                        │
│ ▁▁ FormActions dính đáy (trang form) ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁ │
└──────────────────────────────────────────────────────────────┘
```

| Vùng | Bắt buộc? | Quy tắc |
|---|---|---|
| Breadcrumbs | Trang cấp ≥ 2 | Crumb đầu = mục menu trên cùng (nhãn tiếng Anh ở cả hai site, giống menu). Crumb cuối = trang hiện tại, không phải link. Dưới 521 px chỉ hiện "← {trang cha}". **Không dùng link "← Back to…"**. |
| H1 | Luôn luôn | Hiển thị, đúng tên trang hoặc tên mục menu. Không ẩn H1 (trừ biến thể `media` của Reader). |
| Lede | Tuỳ chọn | Một câu, tối đa 60ch, màu `--muted`. |
| Header actions | Tuỳ chọn | Bên phải H1. Trên điện thoại xuống dưới H1. Cỡ M (40 px). Tối đa **1 nút primary (cam)** mỗi trang, đặt ngoài cùng bên phải. |
| Tabs | Tuỳ chọn | Ngay dưới header, kiểu `tabs__list` gạch chân. |
| Toolbar | Trang danh sách | Xem mục 3. |
| FormActions | Trang form | Xem mục 4. |

**Cấp trang:** cấp 1 = trang mở từ menu trên cùng (kể cả các tab-route của một mục, vd Vietsub › Videos/Playlists/Profiles). Cấp ≥ 2 = trang chi tiết, trang sửa, trang tạo mới, trang con.

**Khoảng cách dọc:** breadcrumbs → H1 16 px (`--space-4`) · header → tabs/toolbar/nội dung 24 px (`--space-6`) ·
tabs → toolbar 16 px · toolbar → nội dung 16 px · giữa các section 48 px (`--space-12`). Lề ngang `--gutter`
(16–40 px), đáy trang 64 px.

**Độ rộng (`<Page width>`):** `default` 1120 px (mặc định) · `wide` 1440 px (chỉ cho trang công cụ toàn màn hình như
Vietsub editor) · `narrow` 760 px (form một cột). Reader giữ khổ đọc riêng.

**Biến thể header (`<PageHeader variant>`):**

- `default`: như khung trên.
- `hero`: trang chi tiết có ảnh bìa (Work, Novel). Ảnh bìa bên trái; H1, chip và actions bên phải; breadcrumbs ở trên.
- `media`: trang xem/đọc (Watch, Reader). Breadcrumbs trên cùng rồi tới player/nội dung. Watch đặt H1 dưới video,
  Reader ẩn H1 (visually hidden). Không trang nào khác được dùng `media`.

## 2. Đặt nút hành động

| Loại hành động | Vị trí |
|---|---|
| Của cả trang (Add work, Add post, Create playlist, Publish chương…) | Header actions, góc phải |
| Chỉ thuộc một tab (Add fanfic, Refresh all, Add chapter, New novel ở tab Translated) | Cuối bên phải Toolbar của tab đó |
| Trên từng dòng/thẻ (sửa, xoá, kéo, lên/xuống) | Cuối dòng bên phải, nút icon S (32 px), Delete là `button--danger` ở ngoài cùng |
| Lưu form | `FormActions` (mục 4) |
| Lưu ở trang công cụ (editor) | Header actions, nút có chữ "Save" (không chỉ icon), phím tắt ghi trong tooltip |

- Tạo mới một đối tượng nhỏ thì mở **dialog** từ nút ở header. Không đặt form tạo mới nằm sẵn trong trang.
- Không dùng nút full-width trên desktop cho hành động (trên điện thoại `FormActions` tự xếp chồng full-width).

## 3. Toolbar (tìm kiếm và lọc)

```
[ Avatar người: All · EmiBonnie · Emi · Bonnie ]          ← chỉ trang lọc theo người (PeopleFilter)
[ 🔍 Tìm kiếm ][ FilterPills ][ Sort ▾ ] ······· [ Hành động của tab ]
```

- Thứ tự cố định: **tìm kiếm → pills → sort → (khoảng trống) → hành động**.
- Ô tìm kiếm `SearchBar`, rộng tối đa 360 px trên desktop, chiếm cả dòng trên điện thoại.
- Lọc một giá trị luôn là `FilterPills` bày sẵn (đang chọn = tím). **Không dùng nút "Filter" mở popover.**
- Sort dùng `Select`.
- Chỉ thêm ô tìm kiếm khi danh sách thực sự cần.

## 4. Form

- Trang form dùng `<Page width="narrow">` và `<FormActions sticky>` dính đáy màn hình:
  `[Delete] ······· [Cancel] [Save]`. Delete (đỏ) dùng slot `start`, Save (primary) ngoài cùng bên phải. Thanh dính đáy luôn **một hàng ở mọi cỡ màn hình** (cao khoảng 65 px trên điện thoại): Delete (slot `start`, bọc chữ trong `<span className="form-actions__label">`, dưới 521 px chỉ còn icon, tên cho trình đọc màn hình giữ nguyên, nút icon có `Tip`), Cancel, và Save ở cuối chiếm phần còn lại. Dialog dùng `FormActions` không sticky vẫn xếp chồng full-width trên điện thoại.
- Dialog có form: `<FormActions>` (không sticky) ở cuối dialog.
- Label bằng `Field`; form trong portal phải `e.stopPropagation()` khi submit (xem CLAUDE.md).
- Trang có `FormActions sticky` phải khai báo trong `BackToTop liftOn`.

## 5. Chữ

| Vai trò | Thẻ | Kiểu |
|---|---|---|
| Tiêu đề trang | `h1` (chỉ qua `PageHeader`) | `--step-3`, 700 |
| Tiêu đề section | `h2` | 20 px, 700 |
| Nhãn nhóm (vd vạch chia năm) | `h2`/`h3` + class nhãn nhóm | 12.8 px, 700, `--muted` |

Ngoại lệ duy nhất: tên thành viên ở trang Profile (hero name). Không thêm cỡ tiêu đề mới.

## 6. Card và danh sách

- **Card:** viền 1 px `--rule`, bo `--radius-frame` (14 px), padding 16 px (12 px dưới 521 px), nền `--surface`.
- **Danh sách để quản lý** (video, playlist, chương…): dạng **hàng có vạch kẻ**, không bọc từng hàng trong hộp.
- **Lưới thẻ** (Works, Photos, Novels public): dùng `Reveal` khi hiện.

## 7. Trạng thái

- **Trống:** luôn dùng `<EmptyState icon=…>` với một câu chỉ bước tiếp theo (và nút nếu có). Không dùng chữ trơn.
- **Đang tải:** cả trang hoặc danh sách dùng skeleton theo hình nội dung (`SkeletonList`/`SkeletonGrid`).
  `LoadingText` chỉ dùng trong dòng (nút, vùng nhỏ).
- **Lỗi:** `Alert`.
- **Không tìm thấy:** `NotFoundPage` (route `*`), hoặc `PageHeader` "X not found" kèm breadcrumbs.

## 8. Mẫu code

```tsx
export default function ThingEditPage() {
  return (
    <Page width="narrow">
      <PageHeader
        breadcrumbs={[{ label: 'Things', to: '/things' }, { label: thing.name, to: `/things/${id}` }, { label: 'Edit' }]}
        title="Edit thing"
      />
      <form onSubmit={save} className="stack">
        <Field label="Name">{(f) => <input id={f.id} … />}</Field>
        <FormActions sticky start={<button type="button" className="button button--danger">Delete</button>}>
          <button type="button" className="button">Cancel</button>
          <button type="submit" className="button button--primary">Save</button>
        </FormActions>
      </form>
    </Page>
  );
}

export default function ThingsPage() {
  return (
    <Page>
      <PageHeader title="Things" lede="One sentence." actions={<button className="button button--primary">Add thing</button>} />
      <Toolbar search={<SearchBar … />} filters={<FilterPills … />} />
      {things.length === 0 ? <EmptyState icon={Box}>No things yet. Choose Add thing to add one.</EmptyState> : <ThingList … />}
    </Page>
  );
}
```

## 9. Checklist cho màn hình mới

- [ ] Dùng `<Page>` và `<PageHeader>`, không viết `<main>`/`<h1>` tay.
- [ ] Cấp ≥ 2 thì có `breadcrumbs`, không có link "Back to…".
- [ ] Tối đa 1 nút primary; hành động trang ở header, hành động tab ở toolbar.
- [ ] Toolbar đúng thứ tự; lọc bằng `FilterPills`.
- [ ] Form: `FormActions` (sticky ở trang form, kèm `BackToTop liftOn`).
- [ ] Có `EmptyState`, skeleton khi tải, `Alert` khi lỗi.
- [ ] Kiểm tra ở 390 px và 1440 px: không tràn ngang, actions xuống dòng gọn.
- [ ] Route mới: thêm vào `App`/`PublicApp`; test `layout-rules.test.ts` vẫn pass.
