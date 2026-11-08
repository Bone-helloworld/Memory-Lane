# Đưa Memory Lane lên mạng

Ứng dụng là **một tiến trình Node.js** phục vụ cả API lẫn giao diện React đã build. Nó giữ hai thứ trên đĩa, đều nằm trong `DATA_DIR`:

- `memorylane.db`: cơ sở dữ liệu SQLite.
- `uploads/`: ảnh, video và bản xem trước.

Vì vậy, yêu cầu thật sự duy nhất với nơi hosting là **một ổ đĩa bền vững** (persistent disk / volume) gắn vào `DATA_DIR`. Thiếu ổ
đĩa này, mỗi lần khởi động lại hay triển khai lại là mất hết tài khoản, ảnh và video. Như thế vẫn ổn cho một buổi demo nhanh,
nhưng không dùng thật được.

> Gói dịch vụ và giá của các nơi hosting thay đổi thường xuyên. Hãy xem trang giá hiện tại trước khi chọn. Ổ đĩa bền vững thường
> là tính năng trả phí (vài USD mỗi tháng).

## Biến môi trường

| Biến | Giá trị khi chạy thật | Ý nghĩa |
| --- | --- | --- |
| `NODE_ENV` | `production` | Cookie `Secure`, tin header HTTPS của proxy, bật HSTS |
| `PORT` | do nơi hosting đặt | Cổng lắng nghe (mặc định 3001) |
| `DATA_DIR` | đường dẫn ổ đĩa, ví dụ `/data` | Cơ sở dữ liệu + tệp tải lên |
| `ALLOW_DEMO` | `true` khi demo cho lớp, `false` khi dùng thật | Hiện nút "Dùng thử bản demo" (An / Thu Hà) |
| `SESSION_DAYS` | `30` | Thời hạn một lần đăng nhập |
| `MAX_UPLOAD_MB` | `15` | Ảnh lớn nhất (ảnh đã nén trong trình duyệt thường < 1 MB) |
| `MAX_VIDEO_MB` | `100` | Video lớn nhất |
| `STORAGE_MB` | tuỳ ổ đĩa, ví dụ `500` | Dung lượng ảnh, video và thẻ đã lưu vào Kỷ vật cho mỗi tài khoản |
| `INVITE_DAYS` | `7` | Thời hạn của một link mời |
| `AUTH_RATE_LIMIT` | `20` | Số lần thử đăng nhập/đăng ký mỗi IP trong 15 phút |
| `GOOGLE_CLIENT_ID` | lấy từ Google Cloud | Bật "Tiếp tục với Google" (xem phần dưới) |
| `GOOGLE_CLIENT_SECRET` | lấy từ Google Cloud | **Bí mật**: chỉ đặt trong mục biến môi trường của nơi hosting, không bao giờ commit |
| `PUBLIC_URL` | `https://ten-mien-cua-ban` | Địa chỉ người dùng gõ để vào app, dùng để tạo địa chỉ quay về của Google |

**Tính ổ đĩa cho video.** Riêng dữ liệu demo đã khoảng 34 MB. Vài tài khoản thử tải video từ điện thoại là đầy 1 GB rất nhanh.
Vì vậy hãy cấp ổ đĩa rộng hơn hoặc giảm `STORAGE_MB`. Xem thêm cách nén video ở [MO-RONG.md](MO-RONG.md#3-video-phần-nặng-nhất).

**Tải tệp lớn qua proxy.** Một video 100 MB là một yêu cầu HTTP:

- Proxy của Render, Railway, Fly.io đều nhận được.
- Nếu đặt **nginx** phía trước, phải nâng giới hạn mặc định 1 MB: `client_max_body_size 110m;`.
- **Cloudflare** gói miễn phí giới hạn mỗi yêu cầu 100 MB, nên đặt `MAX_VIDEO_MB=95`.

**Luồng sự kiện trực tiếp (SSE).** `GET /api/events` là một kết nối mở lâu:

- Máy chủ đã gửi header `X-Accel-Buffering: no`, nên nginx không giữ sự kiện lại.
- Nếu tự cấu hình nginx, đặt `proxy_read_timeout` ≥ 60 giây. Máy chủ gửi tín hiệu "ping" 25 giây một lần.
- Chạy sau **HTTP/2** (có sẵn ở các nền tảng kể trên) để không bị giới hạn 6 kết nối mỗi tên miền của HTTP/1.1.

Lệnh mọi nơi hosting đều cần:

```bash
npm ci && npm run build
```

```bash
npm run start:demo
```

`start:demo` tạo lại các tài khoản demo (không bao giờ đụng tài khoản khác) cùng ảnh và video, rồi bật máy chủ. Dùng `npm start`
nếu đặt `ALLOW_DEMO=false`.

---

## Cách A — Render (Blueprint, vài cú bấm)

Chuẩn bị: dự án đã nằm trên GitHub ([PLAN.md § A3](../PLAN.md#a3-commit-đầu-tiên--github)); `.gitignore` đã loại sẵn `node_modules`,
`data/` và `.env`. Thư mục `server/seed-media/` (ảnh và video demo, khoảng 34 MB) **được** commit có chủ ý. Mở sẵn tệp `.env`
trên máy (`open -e .env` trong thư mục dự án) để lấy hai mã Google.

1. **Tạo tài khoản Render** ở render.com → **Get Started** → đăng nhập bằng GitHub. Khi GitHub hỏi quyền, chọn **Only select
   repositories** và chọn đúng repo của dự án.
2. Bảng điều khiển Render → **New → Blueprint** → chọn repo. Render đọc [`render.yaml`](../render.yaml): một dịch vụ Node tên
   `memory-lane`, build `npm ci && npm run build`, chạy `npm run start:demo`, ổ đĩa 3 GB gắn ở `/var/data`, kiểm tra sức khoẻ
   ở `/api/health`. Ổ đĩa bền vững cần gói trả phí (`plan: starter`); gói miễn phí sẽ xoá dữ liệu mỗi lần khởi động lại.
3. Render hỏi giá trị cho ba biến đánh dấu `sync: false`:
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: chép từ `.env` trên máy (không có dấu cách, không có dấu nháy).
   - `PUBLIC_URL`: điền `https://memory-lane.onrender.com` (tên dịch vụ). Nếu tên đó đã có người dùng, Render cấp một địa chỉ khác:
     sửa lại ở bước 5.
4. Bấm **Apply / Create**. Lần triển khai đầu mất vài phút (tab **Logs** chạy chữ; xong khi thấy `Memory Lane API → …` và dịch vụ
   chuyển sang **Live**). Render cho bạn địa chỉ `https://….onrender.com` ở đầu trang dịch vụ.
5. Vào **Environment**: kiểm tra `PUBLIC_URL` **đúng từng ký tự** với địa chỉ ở bước 4 (có `https://`, không có `/` cuối). Sửa thì
   bấm **Save Changes**; Render tự triển khai lại.
6. **Google Cloud** → Google Auth Platform → **Clients** → client của bạn (đúng cái đang dùng trên máy) → **Authorized redirect URIs** →
   **Add URI** → `https://<địa-chỉ-ở-bước-4>/api/auth/google/callback` → **Save**. Giữ nguyên dòng `http://localhost:5173/…` để máy bạn
   vẫn đăng nhập được. Google có thể mất vài phút để áp dụng.
7. Kiểm tra: mở `https://<địa-chỉ>/api/health` → `{"ok":true}`; mở trang chủ, bấm **Dùng thử bản demo**; đăng xuất, bấm **Tiếp tục
   với Google**. Lỗi `redirect_uri_mismatch` → xem lại bước 5–6; "chưa được xác minh" → thêm email vào **Audience → Test users**.
8. Đăng ký một tài khoản thật, tải lên một ảnh và một video ngắn. Rồi **Manual Deploy → Restart service** (hoặc **Restart**) và kiểm
   tra tài khoản, tệp vẫn còn: nghĩa là ổ đĩa đã hoạt động.
9. Làm tiếp danh sách [kiểm tra nhanh](#sau-khi-triển-khai--kiểm-tra-nhanh-15-phút) ở cuối tài liệu này.

**Mỗi lần cập nhật:** đẩy code lên nhánh `main` → Render tự build và triển khai lại (xem tab **Events**). Trước khi đẩy, sao lưu dữ
liệu (tab **Shell** → `npm run admin -- backup`, [PLAN.md C6](../PLAN.md#c6-sao-lưu-và-khôi-phục)).

## Cách B — Railway

1. **New Project → Deploy from GitHub repo**.
2. Trong **Settings** của dịch vụ: build command `npm ci && npm run build`, start command `npm run start:demo`.
3. **Variables:** `NODE_ENV=production`, `DATA_DIR=/data`, `ALLOW_DEMO=true`, `STORAGE_MB=500`, `PUBLIC_URL`, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`.
4. Thêm một **Volume** cho dịch vụ, mount path `/data`.
5. **Networking → Generate Domain** để có địa chỉ HTTPS công khai.

## Cách C — Docker (Fly.io, máy chủ riêng, bất cứ đâu chạy được container)

[Dockerfile](../Dockerfile) build giao diện React ở giai đoạn đầu, rồi chạy `node server/index.js` bằng người dùng không phải root,
với `DATA_DIR=/data`.

```bash
docker build -t memory-lane .
```

```bash
docker run -p 3001:3001 -v memorylane-data:/data -e ALLOW_DEMO=true memory-lane
```

Trên **Fly.io**:

1. Chạy `fly launch`. Fly tự nhận ra Dockerfile; trả lời *no* khi được hỏi về database.
2. Tạo ổ đĩa: `fly volumes create memorylane_data --size 3`.
3. Thêm vào `fly.toml`:

   ```toml
   [mounts]
     source = "memorylane_data"
     destination = "/data"
   ```

4. Đặt bí mật: `fly secrets set GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… PUBLIC_URL=https://….fly.dev`.
5. Chạy `fly deploy`.

---

## Bật "Tiếp tục với Google"

Nút Google luôn hiện trên trang đăng nhập/đăng ký. Khi máy chủ chưa có `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET`, nút **bị mờ**
kèm dòng "Máy chủ này chưa bật đăng nhập Google…". Đó không phải lỗi: Google chỉ cho đăng nhập qua một **OAuth client** do chính
chủ dự án tạo trong Google Cloud. Việc này miễn phí, mất khoảng 10 phút, và bạn phải tự làm vì tài khoản Google Cloud là của bạn.

### Cách nhanh trên máy: `npm run setup:google`

```bash
npm run setup:google
```

Lệnh này in ra các bước bên dưới, hỏi **Client ID** và **Client secret**, rồi ghi chúng vào `.env` (tạo từ `.env.example` nếu
chưa có; tệp chỉ mình bạn đọc được và không bao giờ được commit). Nếu `npm run dev` đang chạy, máy chủ API tự khởi động lại. Tải
lại trang đăng nhập là nút Google bấm được.

### Tạo OAuth client trong Google Cloud

Giao diện Google Cloud gọi khu vực này là **Google Auth Platform**. Tên cũ là "APIs & Services → OAuth consent screen / Credentials".

1. Vào **console.cloud.google.com/auth/clients**, chọn hoặc tạo một **Project** (ví dụ `memory-lane`).
2. Lần đầu, Google hỏi thông tin ứng dụng (**Get started**):
   - App name: `Memory Lane`; User support email: email của bạn.
   - **Audience: External**; Contact information: email của bạn.
   - Quyền (scopes): chỉ cần `openid`, `email`, `profile`. Memory Lane chỉ đọc tên và email, không đọc ảnh hay danh bạ.
3. Mục **Audience → Test users → Add users**: thêm email của bạn, của giảng viên và của bạn bè sẽ thử. Khi app đang ở chế độ
   **Testing**, chỉ những tài khoản này đăng nhập được. Vì app chỉ xin ba quyền cơ bản trên, bạn có thể bấm **Publish app**
   (chuyển sang **In production**) để ai cũng dùng được, không cần Google duyệt.
4. Mục **Clients → Create client**:
   - Application type: **Web application**.
   - **Authorized redirect URIs**: thêm **đúng từng ký tự** các địa chỉ bạn dùng:

     | Khi chạy | Redirect URI |
     | --- | --- |
     | `npm run dev` | `http://localhost:5173/api/auth/google/callback` |
     | `npm start` trên máy | `http://localhost:3001/api/auth/google/callback` |
     | Bản online | `https://TEN-MIEN-CUA-BAN/api/auth/google/callback` |

5. Bấm **Create**, chép **Client ID** (dạng `….apps.googleusercontent.com`) và **Client secret** (thường bắt đầu bằng `GOCSPX-`).
6. Trên máy: chạy `npm run setup:google` và dán hai giá trị đó. (Cách làm tay: chép `.env.example` thành `.env`, điền
   `GOOGLE_CLIENT_ID=` và `GOOGLE_CLIENT_SECRET=`, rồi chạy lại `npm run dev`.)
   Trên nơi hosting: thêm hai biến này **và** `PUBLIC_URL` vào phần biến môi trường. Không đặt `PUBLIC_URL` trong `.env` trên máy.
7. Thử: trang đăng nhập → **Tiếp tục với Google** → chọn tài khoản → về lại trang **Hôm nay**. Trong **Cài đặt**, mục "Đăng nhập
   bằng Google" hiện "Đã liên kết với …".

**Lỗi thường gặp:**

- **Nút Google vẫn mờ**: máy chủ chưa đọc được hai biến. Kiểm tra `.env` nằm cạnh `package.json`, rồi tắt và chạy lại
  `npm run dev`. Địa chỉ `http://localhost:5173/api/auth/session` phải trả về `"google":true`.
- `Lỗi 400: redirect_uri_mismatch`: địa chỉ ở bước 4 không khớp với địa chỉ app gửi. Bấm **"thông tin chi tiết về lỗi"** trên
  trang báo lỗi của Google để xem đúng `redirect_uri` app đã gửi, rồi so: `http`/`https`, `localhost` hay `127.0.0.1`, cổng (`5173`
  khi `npm run dev`), dấu `/` cuối, và `PUBLIC_URL` khi chạy thật. Google có thể mất vài phút để áp dụng địa chỉ mới.
- `access_denied` / "has not completed the Google verification process": email đó chưa có trong **Test users** (bước 3).
- **Không dùng được qua địa chỉ Wi-Fi** `http://192.168…` (`npm run dev:phone`): Google chỉ cho phép `localhost` hoặc tên miền thật
  có HTTPS. Muốn thử Google trên điện thoại, hãy dùng bản online.
- "Email này đã có album trên Memory Lane": đó là tính năng bảo mật, không phải lỗi. Hãy đăng nhập bằng mật khẩu, rồi vào **Cài đặt
  → Liên kết tài khoản Google**.

Cách hoạt động (PKCE, state, nonce, vì sao không tự gộp tài khoản) được giải thích trong
[PRESENTATION.md § 7.12](PRESENTATION.md#712-đăng-nhập-bằng-google--oauth-20--openid-connect).

---

## Sau khi triển khai — kiểm tra nhanh (15 phút)

- [ ] Trước khi deploy, trên máy: `npm test` và `npm run test:e2e` đều đạt
- [ ] `https://dia-chi-cua-ban/api/health` trả về `{"ok":true}`
- [ ] `https://dia-chi-cua-ban/api/auth/session` trả về `{"user":null,"demo":true,"google":true,"limits":{…}}`
- [ ] Trang giới thiệu hiện đúng; nút VI/EN và nút đổi Sổ tay/Phòng tối hoạt động
- [ ] Đăng nhập bằng Google được; đăng ký bằng email được
- [ ] Tạo một kỷ niệm có ảnh **và video quay dọc**: thanh tiến trình chạy, video phát và tua được, khung xem theo đúng hình dạng
      video
- [ ] Mở link một ảnh/video trong cửa sổ ẩn danh: **401**. Đăng nhập người khác: **404** (tệp là riêng tư)
- [ ] Tạo link mời ngay trong form tạo kỷ niệm, mở link ở cửa sổ ẩn danh, đăng ký, nhận lời mời: hai tài khoản đã kết nối và
      người mới thấy kỷ niệm đó
- [ ] Mở cùng một kỷ niệm ở hai trình duyệt (hai tài khoản), viết lời nhắn ở bên này: bên kia **thấy ngay** không cần tải lại
- [ ] Tạo một bưu thiếp từ một kỷ niệm, tải về, rồi **Lưu vào Kỷ vật**: tab Kỷ vật mở đúng tấm thẻ đó
- [ ] Mở bằng **iPhone và Android**: chạm vào ô nhập không bị phóng to, menu mở được, "Chia sẻ…" mở bảng chia sẻ của máy
- [ ] Header có `Strict-Transport-Security`, cookie phiên có `Secure; HttpOnly; SameSite=Lax` (công cụ nhà phát triển → Network)
- [ ] Khởi động lại dịch vụ: dữ liệu và tệp vẫn còn
- [ ] Trong Shell của nơi hosting: `npm run admin -- stats` thấy đúng số tài khoản; `npm run admin -- backup` tạo được bản sao lưu

## Sau đó: vận hành hằng ngày

Khi đã có người dùng thật, mọi việc "sau khi deploy" nằm trong [PLAN.md, Phần C](../PLAN.md#phần-c--vận-hành-bảo-trì-và-xử-lý-sự-cố):

- **Theo dõi:** `/api/health` (Render dùng nó làm health check; Docker có `HEALTHCHECK`), log có dòng `SERVER <mã lỗi>` khi có lỗi
  không lường trước, và người dùng thấy cùng mã đó trên màn hình ([C2](../PLAN.md#c2-nhìn-vào-đâu-apihealth-log-mã-lỗi-devtools)).
- **Công cụ quản trị** `npm run admin`: tra tài khoản, đặt mật khẩu tạm, đăng xuất mọi nơi, kiểm tra tệp, sao lưu
  ([C3](../PLAN.md#c3-công-cụ-quản-trị-npm-run-admin)).
- **Sao lưu** trước mỗi lần deploy và mỗi tuần, rồi chép ra ngoài máy chủ ([C6](../PLAN.md#c6-sao-lưu-và-khôi-phục)).
- **Khi mở cho người dùng thật:** `ALLOW_DEMO=false` và đổi `startCommand` trong `render.yaml` thành `npm start`
  ([C8](../PLAN.md#c8-an-toàn-và-riêng-tư-khi-vận-hành)).

## Khi một máy chủ không còn đủ

SQLite và thư mục `uploads/` rất hợp với một máy chủ. Khi cần nhiều máy chủ sau một bộ cân bằng tải, đọc
[MO-RONG.md](MO-RONG.md). Tóm tắt:

- **PostgreSQL** thay SQLite.
- **Kho lưu trữ đối tượng** (S3, Cloudflare R2) cho ảnh/video, kèm link có chữ ký ngắn hạn.
- **Worker ffmpeg** để nén video.
- **Redis** cho giới hạn tần suất và cho sự kiện trực tiếp giữa các máy chủ.
