# Sửa nội dung tiếng Việt của giao diện

Toàn bộ chữ tiếng Việt mà người dùng nhìn thấy nằm trong **một file duy nhất**:

```
client/src/i18n/vi.js
```

Bạn mở file này (VS Code, hoặc bất kỳ trình soạn thảo nào), sửa câu chữ, lưu lại là xong.
Không cần đụng vào code React hay máy chủ. Bản tiếng Anh nằm ở `client/src/i18n/en.js`, có cùng cấu trúc.

> Ngoại lệ duy nhất: tên tài khoản, kỷ niệm, kỷ vật và lời nhắn của **dữ liệu demo** nằm trong `server/seed.js`, không nằm trong
> `vi.js` (đó là dữ liệu mẫu, không phải chữ của giao diện).

---

## 1. File trông như thế nào

```js
  // ── Album ảnh (/album) ──
  album: {
    title: 'Album ảnh',
    count: '{count} ký ức',
    emptyTitle: 'Album còn trống',
    ...
  },
```

- `album` là **nhóm** (thường ứng với một màn hình). Dòng chú thích `// ── … ──` phía trên cho biết màn hình đó là gì.
- `title`, `count`, `emptyTitle` là **khóa** (tên mà code dùng để tìm câu). **Không đổi tên khóa.**
- Phần trong dấu nháy `'…'` là **câu hiển thị**. **Chỉ sửa phần này.**

## 2. Năm quy tắc

1. **Chỉ sửa chữ trong dấu nháy.** Giữ nguyên dấu nháy, dấu hai chấm và dấu phẩy cuối dòng.
2. **Giữ nguyên các chỗ trong ngoặc nhọn** như `{name}`, `{count}`, `{date}`, `{title}`, `{max}`.
   Ứng dụng tự điền giá trị vào đó. Bạn được đổi vị trí của chúng trong câu:
   `'{name} mời bạn vào Memory Lane'` → `'Bạn được {name} mời vào Memory Lane'` ✓
3. **Dấu nháy đơn trong câu** phải viết thành `\'`, ví dụ `'Ba hay nói \'cố lên con\''`.
   Cách dễ hơn: dùng ngoặc kép cong “…” (đã dùng sẵn trong nhiều câu).
4. **Không để câu trống** (`''`). Nếu muốn ẩn một câu, hãy báo để chỉnh code.
5. **Không xoá khóa**, trừ khi xoá cùng khóa đó trong `en.js` (hai file phải có đúng các khóa giống nhau).

## 3. Xem kết quả ngay khi sửa

```bash
npm run dev
```

Mở <http://localhost:5173>. Mỗi lần bạn lưu `vi.js`, trang tự tải lại với câu mới.
(Nếu đang chạy bản đã build bằng `npm start`, hãy chạy `npm run build` rồi tải lại trang.)

Bấm **VI | EN** trên thanh điều hướng để so sánh với bản tiếng Anh.

## 4. Kiểm tra sau khi sửa

```bash
npm test
```

Bộ kiểm tra sẽ báo nếu:

- một khóa có ở `vi.js` mà không có ở `en.js` (hoặc ngược lại),
- một câu làm mất hoặc gõ sai chỗ `{name}`, `{count}`…,
- một câu bị để trống,
- file bị lỗi cú pháp (thiếu dấu phẩy, thiếu dấu nháy…).

## 5. Tìm câu đang thấy trên màn hình

Cách nhanh nhất: trong VS Code nhấn **Cmd + Shift + F** (Windows: Ctrl + Shift + F), gõ một đoạn của câu
đang thấy trên màn hình, ví dụ `Chưa có lời nhắn`. Kết quả sẽ chỉ đúng dòng trong `vi.js`.

| Màn hình | Nhóm khóa trong `vi.js` |
|---|---|
| Thanh điều hướng, menu tài khoản, menu trên điện thoại | `nav` (tên tab ngắn: `nav.tabs`) |
| Nút đổi giao diện Sổ tay / Phòng tối | `theme` |
| Trang giới thiệu `/` (chưa đăng nhập) | `landing` |
| Đăng nhập, Tạo tài khoản | `auth` |
| Nút **"Tiếp tục với Google"** và thông báo kết quả đăng nhập Google | `google` (kết quả: `google.result`) |
| Trang mở link mời `/join/…` | `join` |
| Hôm nay `/today` | `greeting`, `hero`, `today`, `suggestion` |
| Album `/album` + thanh chọn năm | `album`, `years` |
| Trang một ký ức `/album/…` | `memory`, `gallery` |
| Khung "Lưu ký ức mới / Sửa ký ức" (phần ảnh & video) | `memory`, `upload` |
| Mục **"Chia sẻ kỷ niệm này"** ở cuối khung đó | `memoryShare` |
| Lời nhắn dưới mỗi ký ức | `comments` |
| Thông báo nhỏ ở góc màn hình khi có lời nhắn, chia sẻ mới | `live` |
| Khung "Chia sẻ với" (chủ ký ức) | `share` |
| Khung "Mời người thân" (tạo link mời) | `invite` |
| Trang Chia sẻ `/sharing` | `sharing` |
| Kỷ vật `/artifacts` (danh mục thẻ đã lưu, cửa sổ chọn kỷ niệm, khung xem một kỷ vật) | `artifacts` |
| Cửa sổ **"Tạo thẻ kỷ niệm"** (cả nút "Lưu vào Kỷ vật"; chữ vẽ lên tấm thẻ: `cards.canvas`) | `cards` |
| Người quen `/people`, trang một người | `people`, `person` |
| Phim & nhạc `/archive` | `archive` |
| Dòng thời gian `/timeline` | `timeline` |
| Tìm kiếm | `search` |
| Cài đặt riêng tư `/settings` (cả mục Google và "Đặt mật khẩu") | `settings`, `theme`, `google` |
| Trang 404 | `notFound` |
| Thông báo lỗi | `errors`, `state` |
| Chân trang trong ứng dụng | `app` |

## 6. Câu mới cần bạn duyệt

Câu cho tính năng mới là **bản nháp** do mình viết. Trong `vi.js`, chúng có dòng chú thích:

```js
// ✎ MỚI — bản nháp, cần duyệt (vòng 4)
```

Chú thích nằm ở đầu nhóm (cả nhóm là câu mới) hoặc ở cuối dòng (chỉ dòng đó là câu mới).

### Vòng 4 — tìm chữ `vòng 4` trong `vi.js`

Tab Kỷ vật giờ chỉ gồm **những thẻ (bưu thiếp, con tem, thẻ ảnh) bạn tạo từ chính kỷ niệm của mình** rồi bấm "Lưu vào Kỷ vật".

| Câu mới | Ở đâu trên màn hình |
|---|---|
| Cả nhóm `artifacts` (viết lại toàn bộ) | Tab Kỷ vật: tiêu đề, lời dẫn, nút "Tạo từ một kỷ niệm", nhãn "từ kỷ niệm “…”", cửa sổ chọn kỷ niệm (`artifacts.pick.*`), khung xem một kỷ vật (`artifacts.view.*`), hộp xác nhận xoá. `artifacts.inMemory` là nhãn "Kỷ vật" trên trang một kỷ niệm |
| `cards.keep`, `cards.keptButton`, `cards.kept`, `cards.keepFailed` | Nút "Lưu vào Kỷ vật" trong cửa sổ tạo thẻ (chỉ chủ kỷ niệm thấy), chữ trên nút sau khi đã lưu, thông báo lưu xong / lỗi |
| `cards.privacyKeep` | Dòng riêng tư trong cửa sổ tạo thẻ khi bạn là chủ kỷ niệm (người được chia sẻ vẫn thấy câu cũ `cards.privacy`) |
| `memory.confirmArtifacts` | Câu nối thêm vào hộp "Xóa ký ức này?" khi kỷ niệm có thẻ đã lưu: "{count} thẻ đã lưu trong Kỷ vật… cũng sẽ bị xóa" |
| `google.setupHint` | Dòng nhắc dưới nút Google đang mờ. **Chỉ hiện khi chạy `npm run dev` trên máy**, không bao giờ hiện ở bản online |
| `join.previewLabel`, `join.ownTry` | Khi bạn tự mở link mời của chính mình: dòng trên hình xem trước "người nhận sẽ thấy", và gợi ý mở trong cửa sổ ẩn danh |
| `join.switchAccount` | Khi mở link mời của người khác lúc đang đăng nhập: dòng "Không phải bạn? Đăng xuất…" |
| `join.daysLeft` | "(còn {count} ngày)" nối sau "Lời mời hết hạn ngày …". **Giữ nguyên `{count}`** |
| `errors.ref` | "Mã lỗi: {ref}." nối sau câu báo lỗi máy chủ (`errors.SERVER`), để người dùng chép mã gửi cho bạn. **Giữ nguyên `{ref}`** |

**Đã xoá cùng tính năng cũ:** các câu kỷ vật kiểu "đồ vật / thư từ / giấy tờ" của vòng 3 (`artifacts.kind.*`, cả nhóm
`artifacts.form.*`, `artifacts.view.year`, `origin`, `keptAt`, `memories`, `edit`). Đó là bản nháp của mình, bạn chưa sửa câu nào.

### Vòng 3 — tìm chữ `vòng 3` trong `vi.js`

| Câu mới | Ở đâu trên màn hình |
|---|---|
| Cả nhóm `google` | Nút "Tiếp tục với Google", mục Google trong Cài đặt, các thông báo kết quả (`google.result.*`) |
| Cả nhóm `memoryShare` | Mục "Chia sẻ kỷ niệm này" trong khung thêm/sửa kỷ niệm |
| ~~Cả nhóm `artifacts`~~ | Đã viết lại ở vòng 4 (xem trên) |
| Cả nhóm `cards` | Cửa sổ "Tạo thẻ kỷ niệm" và chữ vẽ lên tấm thẻ (`cards.canvas`) |
| Cả nhóm `live` | Thông báo nhỏ khi có lời nhắn, chia sẻ, người nhận lời mời |
| `nav.tabs.artifacts`, `search.artifacts` | Tên tab "Kỷ vật", nhóm kết quả tìm kiếm |
| `settings.setPasswordTitle`, `setPasswordHint`, `setPassword`, `passwordSet` | Cài đặt của tài khoản tạo bằng Google (chưa có mật khẩu) |
| `invite.linkLabel` | Nhãn ô chứa đường link mời |
| `errors.NEEDS_PASSWORD` | Báo lỗi khi huỷ liên kết Google mà chưa đặt mật khẩu |

> Lưu ý: tiêu đề cửa sổ thẻ đang là “một artifact từ kỷ niệm này” (`cards.kicker`), có chữ tiếng Anh *artifact* theo ý tưởng của
> bạn. Nếu muốn thuần Việt, có thể đổi thành “một kỷ vật từ kỷ niệm này”.

### Vòng 2 — tìm chữ `✎ MỚI` không kèm "(vòng 3)"

Nhóm mới hoàn toàn: `app`, `theme`, `gallery`, `upload`, `comments`, `share`, `invite`, `join`, `sharing`.
Ngoài ra có vài câu mới được thêm vào nhóm cũ: `nav`, `landing`, `auth`, `today`, `album`, `memory`,
`people`, `person`, `timeline`, `settings`, `errors`.

## 7. Đổi tên thành Memory Lane — 7 câu cũ đã được sửa

Theo yêu cầu đổi tên dự án, mình đã thay chữ "Hoài Niệm" bằng **"Memory Lane"** trong đúng 7 câu cũ dưới đây. Ngoài tên, câu chữ
giữ nguyên. Đây là những câu cũ **duy nhất** mình đã sửa.

| Khóa | Câu hiện tại |
|---|---|
| `landing.share.demoLine` | An mời bạn vào Memory Lane và chia sẻ kỷ niệm “Hội An”. |
| `person.invite` | Mời dùng Memory Lane |
| `person.inviteTitle` | Mời {name} dùng Memory Lane |
| `person.linkedLine` | {name} đã tham gia Memory Lane với tên {account}. Bạn có thể chia sẻ kỷ niệm ngay trong trang kỷ niệm. |
| `invite.title` | Mời người thân vào Memory Lane |
| `invite.shareText` | Vào Memory Lane với mình nhé — mình muốn chia sẻ vài kỷ niệm cũ với bạn. |
| `join.title` | {name} mời bạn vào Memory Lane |

Muốn dùng một tên tiếng Việt song song (ví dụ "Memory Lane — Lối nhỏ ký ức"), bạn chỉ cần sửa các câu này.

## 8. Câu cũ nên xem lại vì tính năng mới

Những câu dưới đây **chưa bị sửa** (theo đúng yêu cầu của bạn), nhưng ý của chúng có thể không còn khớp hoàn toàn
với ứng dụng bây giờ:

| Khóa | Câu hiện tại | Vì sao nên xem lại |
|---|---|---|
| `landing.featuresTitle`, `landing.feature.*` | Ba ngăn kéo cho những ngày đã qua | Giờ có thêm ngăn **Kỷ vật**, nhưng trang giới thiệu vẫn kể 3 ngăn. Nếu muốn thêm thẻ thứ tư, báo mình thêm code, rồi bạn đổi "Ba" thành "Bốn". *(vòng 3)* |
| `settings.dataBody` | Ký ức, người quen, ghi chú và kho phim nhạc trong một tệp JSON… | Tệp xuất giờ còn có danh sách chia sẻ, người đã kết nối, lời mời, lời nhắn và **kỷ vật**. |
| `settings.dangerBody` | Mọi ký ức, ảnh, người quen… sẽ bị xóa vĩnh viễn. | Còn có video, **kỷ vật**, lời nhắn bạn đã viết, và kết nối với người thân. |
| `auth.note` | Mật khẩu được băm bằng scrypt · ảnh không bao giờ công khai | Vẫn đúng, nhưng giờ có thể đăng nhập bằng Google (không cần mật khẩu). *(vòng 3)* |
| `landing.promise` | Không bảng tin · Không quảng cáo · Chỉ mình bạn xem | Giờ có thể chia sẻ với người thân (dù mặc định vẫn chỉ mình bạn). Câu này cũng hiện ở chân trang. |
| `auth.note`, `settings.promise2`, `landing.principle.twoBody` | "ảnh không bao giờ công khai…" | Vẫn đúng, nhưng giờ còn có video và người được chia sẻ cũng xem được. |
| `memory.confirmBody` | “{title}” và ảnh của nó sẽ bị xóa vĩnh viễn. | Một ký ức giờ có nhiều ảnh và video. Các thẻ đã lưu vào Kỷ vật từ ký ức đó **cũng bị xoá**; khi có thẻ, câu `memory.confirmArtifacts` (vòng 4) được nối thêm phía sau. |
| `errors.field.FILE_TYPE`, `FILE_TOO_LARGE`, `UPLOAD_FAILED` | "Chỉ nhận ảnh…", "Ảnh quá lớn…", "Tải ảnh lên thất bại…" | Giờ tải được cả video. (Khung tải lên đã dùng câu riêng trong nhóm `upload.errors`.) |
| `nav.today`, `nav.album`, `nav.people` | Hôm nay gợi lại, Album ảnh, Người quen cũ | Hiện dùng làm tên tab trình duyệt; tên trên thanh điều hướng là nhóm `nav.tabs`. |

## 9. Câu không còn dùng

Giao diện mới không còn hiển thị một số câu cũ (ví dụ phần chọn **một** ảnh của form cũ). Trong `vi.js`
chúng có ghi chú `// (giao diện mới không còn dùng)` ở cuối dòng. Bạn có thể để nguyên, hoặc xoá
**cùng khóa đó trong cả `vi.js` và `en.js`** rồi chạy `npm test`.

## 10. Lỗi thường gặp

| Triệu chứng | Nguyên nhân |
|---|---|
| Trang trắng, `npm test` báo lỗi cú pháp | Thiếu dấu phẩy cuối dòng, hoặc dấu nháy `'` nằm giữa câu mà không có `\` |
| Màn hình hiện chữ kiểu `upload.drop` | Khóa bị đổi tên hoặc bị xoá |
| Câu hiện nguyên `{name}` | Gõ sai tên trong ngoặc nhọn (ví dụ `{ten}`) |
| `npm test`: *placeholders differ* | Câu tiếng Việt thiếu hoặc thừa một `{…}` so với bản tiếng Anh |
| Chữ trên **thẻ kỷ niệm** bị tràn hoặc đè lên nhau | Câu trong `cards.canvas` được vẽ thẳng lên thẻ, không tự xuống dòng: hãy viết ngắn |
