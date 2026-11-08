# Đưa Memory Lane lên mạng, rồi trông nom

Tài liệu này chọn **một** chỗ để chạy bản production: [Render](https://render.com), loại **Web Service** (Node), kèm **ổ đĩa gắn kèm**. Repo đã có sẵn `render.yaml` đúng kiểu này.

[DEPLOY.md](DEPLOY.md) vẫn hữu ích nếu bạn muốn so Railway hoặc Docker/Fly.io, và khi bật đăng nhập Google (phần đó dài hơn). Đọc xong file này trước.

Giá trên trang Render đổi theo thời điểm. Các con số dưới đây lấy từ trang giá công khai của Render (gói Free, gói trả phí rẻ nhất khoảng 7 USD/tháng cho 0,5 CPU và 512 MB RAM, ổ đĩa khoảng 0,25 USD/GB/tháng). Hãy mở https://render.com/pricing ngay trước khi bấm thanh toán.

## Vì sao là Render, và vì sao không phải trang tĩnh

App này là **một tiến trình Node**. Express vừa trả API vừa trả giao diện đã build trong `client/dist/`. Ảnh và SQLite nằm trên đĩa (`DATA_DIR`). Luồng SSE (`GET /api/events`) là kết nối HTTP giữ mở. Phiên đăng nhập và rate limit nằm trong RAM của đúng tiến trình đó.

Hệ quả:

- **Không** deploy như static site lên Netlify, Vercel, GitHub Pages, hay "output directory = `client/dist`". Trang sẽ hiện, mọi `/api` sẽ chết.
- **Không** tách frontend lên Vercel và "để API tính sau". Cookie, CORS và file ảnh đang giả định cùng một nguồn gốc.
- **Không** bật nhiều instance. SQLite trên một file, SSE và rate limit không chia sẻ giữa các máy. Ổ đĩa của Render cũng chỉ gắn được vào một instance — điều này khớp với app.
- **Không** dùng Postgres của Render trừ khi bạn tự viết lại toàn bộ `server/models/` và `server/db.js`. Không có database ngoài. Ổ đĩa chính là database.

Gói **Free** của Render chạy được Node, có HTTPS, nhưng đĩa là tạm: mỗi lần restart, deploy lại, hoặc ngủ sau khoảng 15 phút không ai vào, **mất hết tài khoản và ảnh**. Free cũng không gắn persistent disk. Chỉ dùng Free để xem pipeline build có xanh. Album thật cần gói trả phí có ổ đĩa.

`render.yaml` trong repo đã chọn gói `starter` (trả phí), đĩa 3 GB gắn ở `/var/data`, build `npm ci && npm run build`, health check `/api/health`. Đó là đường ngắn nhất vì bạn không phải nghĩ lại lệnh build.

## Trước khi bấm

1. Code đã nằm trên GitHub. Máy này build được: `npm ci` rồi `npm run build` (Vite ghi `client/dist/`). `npm test` hiện đủ 72 bài.
2. Bạn chấp nhận trả khoảng 7 USD/tháng cho máy, cộng khoảng 0,75 USD cho đĩa 3 GB. Muốn rẻ hơn lúc đầu: đĩa 1 GB và `STORAGE_MB=400`. Video demo trong git khoảng 34 MB, vài video điện thoại là đầy 1 GB.
3. Quyết định hai biến **trước** khi cho người thân dùng:
   - Album lớp / demo: `ALLOW_DEMO=true` và lệnh chạy `npm run start:demo` (đúng như `render.yaml`). Ai cũng bấm được nút vào tài khoản An.
   - Album gia đình: `ALLOW_DEMO=false` và lệnh chạy `npm start`. Nút demo biến mất. `start:demo` chỉ ghi lại user demo, không xoá user thật, nhưng cứ tắt hẳn cho chắc.

Nếu quên `ALLOW_DEMO`, code coi như `true` (`server/config.js`). Trên hosting hãy đặt biến này tường minh.

## Thông số điền trên Render

Tạo bằng Blueprint thì các dòng này đã nằm trong `render.yaml`. Tạo tay thì điền đúng bảng. Nếu form hỏi "Publish directory" hoặc "Output directory", bạn đang chọn nhầm Static Site — quay lại, chọn **Web Service**.

| Ô | Giá trị |
| --- | --- |
| Loại dịch vụ | Web Service, runtime Node (không Docker, trừ khi bạn tự muốn dùng `Dockerfile`) |
| Nhánh | `main` |
| Build command | `npm ci && npm run build` |
| Start command, album thật | `npm start` |
| Start command, bản demo cho lớp | `npm run start:demo` |
| Output / publish directory | để trống. Vite xuất `client/dist/`, Express tự phục vụ thư mục đó |
| Health check path | `/api/health` |
| Số instance | 1 |
| Gói máy | `starter` (trả phí, có đĩa). Free chỉ để thử build |
| Disk name | `memory-lane-data` |
| Disk mount path | `/var/data` |
| Disk size | 1 GB tối thiểu để thử, 3 GB như `render.yaml` nếu có video |
| Region | Singapore nếu có, cho gần Việt Nam |

`PORT` do Render gán. Đừng đặt `PORT=3001` trên dashboard, nếu không proxy của Render có thể không nối tới app. Code đã đọc `process.env.PORT`.

### Biến môi trường

Đặt trong mục Environment của service. Không đưa các giá trị này vào git.

| Biến | Album thật | Ghi chú |
| --- | --- | --- |
| `NODE_ENV` | `production` | Bật cookie `Secure`, HSTS, `trust proxy`. Quên biến này là cookie hết an toàn trên HTTPS. |
| `NODE_VERSION` | `24` | Khớp CI và `Dockerfile`. |
| `DATA_DIR` | `/var/data` | Phải trùng mount path của đĩa. |
| `ALLOW_DEMO` | `false` | Bản demo cho lớp thì `true`. |
| `STORAGE_MB` | `500` | Nhỏ hơn dung lượng đĩa. Để chỗ cho file WAL và bản sao lưu. |
| `PUBLIC_URL` | `https://ten-mien-cua-ban` | Không có dấu `/` cuối. Bắt buộc nếu bật Google. |
| `GOOGLE_CLIENT_ID` | để trống nếu chưa dùng Google | |
| `GOOGLE_CLIENT_SECRET` | để trống nếu chưa dùng Google | Bí mật. `render.yaml` đánh dấu `sync: false` để Render hỏi lúc tạo, không lưu trong repo. |
| `SESSION_DAYS` | `30` | Có thể bỏ qua, code mặc định 30. |
| `MAX_UPLOAD_MB` | `15` | Có thể bỏ qua. |
| `MAX_VIDEO_MB` | `100` | Nếu phía trước có Cloudflare gói miễn phí, đặt `95` (trần body khoảng 100 MB). |
| `INVITE_DAYS` | `7` | Có thể bỏ qua. |
| `AUTH_RATE_LIMIT` | `20` | Có thể bỏ qua. |

## Các bước bấm

### A. Tạo service từ Blueprint

1. Vào https://render.com → **Get Started** → đăng nhập bằng GitHub. Khi GitHub hỏi quyền, chọn đúng repo Memory Lane, không cần toàn bộ tài khoản.
2. Dashboard → **New** → **Blueprint**.
3. Chọn repo. Render đọc `render.yaml`: service `memory-lane`, build `npm ci && npm run build`, start `npm run start:demo`, đĩa `/var/data` 3 GB, health `/api/health`, `NODE_ENV=production`, `NODE_VERSION=24`, `DATA_DIR=/var/data`, `ALLOW_DEMO=true`, `STORAGE_MB=500`.
4. Render hỏi ba biến `sync: false`:
   - `PUBLIC_URL`: tạm điền `https://memory-lane.onrender.com`. Sửa lại ở bước 6 nếu tên bị trùng.
   - `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET`: bỏ trống nếu chưa tạo OAuth client. Nút Google sẽ hiện nhưng không bấm được. Không sao.
5. Với album gia đình, **trước khi bấm Apply**, mở phần service trong Blueprint và sửa:
   - `ALLOW_DEMO` = `false`
   - Start command = `npm start`
6. Bấm **Apply**. Tab **Logs** chạy vài phút. Xong khi có dòng `Memory Lane API` và trạng thái **Live**. Đầu trang là URL `https://....onrender.com`.
7. Mở `https://URL-CUA-BAN/api/health`. Phải thấy `{"ok":true}`.
8. Mở đúng URL đó (không có `/api`). Đăng ký một tài khoản mới, tải một ảnh nhỏ.
9. Dashboard → **Manual Deploy** → **Restart service**. Đăng nhập lại. Ảnh còn là đĩa đã gắn đúng. Ảnh mất nghĩa là `DATA_DIR` không trỏ vào mount path, hoặc bạn đang ở gói Free.

### B. Tạo tay, nếu Blueprint không hiện

1. **New** → **Web Service** → repo → nhánh `main`.
2. Runtime **Node**. Điền build, start, health check, instance như bảng ở trên.
3. **Advanced** hoặc mục Disks → **Add disk** → mount `/var/data`, kích thước bạn chọn. Lưu ý của Render: thêm đĩa làm mỗi lần deploy có vài giây gián đoạn, vì hai bản app không được cùng ghi một file SQLite.
4. **Environment** → thêm từng biến trong bảng.
5. **Create Web Service**. Rồi làm bước 7–9 của cách A.

Mỗi lần đẩy commit lên `main`, Render tự build lại. Đĩa không bị tạo mới. Vẫn nên sao lưu trước khi deploy bản đụng schema (mục sao lưu bên dưới).

## Tên miền riêng và HTTPS

URL `*.onrender.com` đã có HTTPS. Làm tên miền khi URL đó đã trả `{"ok":true}`.

1. Mua tên miền ở nhà đăng ký bạn đang dùng (Cloudflare, Namecheap, Nhà đăng ký tên miền Việt Nam, …).
2. Trên Render: service → **Settings** → **Custom Domains** → **Add Custom Domain**. Gõ tên, ví dụ `memory.example.com`.
3. Render hiện bản ghi DNS. Làm đúng loại nó yêu cầu:
   - Tên phụ (`memory.example.com`): bản ghi **CNAME** trỏ tới host `....onrender.com` của service.
   - Tên gốc (`example.com`): bản ghi **ALIAS** / **ANAME**, hoặc các bản ghi **A** mà Render liệt kê. CNAME ở tên gốc nhiều nhà đăng ký không cho.
4. Lưu DNS. Đợi Render chuyển trạng thái domain sang đã xác minh. Chứng chỉ được cấp tự động (Let's Encrypt). Không cần cài certbot trên máy bạn. Lần đầu có thể mất vài phút đến vài giờ tuỳ DNS.
5. Sửa `PUBLIC_URL` thành `https://memory.example.com` (đúng giao thức, không có `/` cuối) → **Save**. Render deploy lại.
6. Mở `https://memory.example.com/api/health`. Trình duyệt phải hiện ổ khoá. HSTS chỉ được gửi khi `NODE_ENV=production` (`server/lib/security.js`).
7. Nếu đã bật Google: Google Cloud → client OAuth → **Authorized redirect URIs** thêm đúng

   `https://memory.example.com/api/auth/google/callback`

   Giữ thêm dòng localhost nếu máy bạn vẫn `npm run dev`. Sai một ký tự là Google báo `redirect_uri_mismatch`. Chi tiết từng ô trong Google Cloud nằm ở [DEPLOY.md](DEPLOY.md).

Đừng đặt Cloudflare "orange cloud" phía trước cho đến khi bạn hiểu giới hạn body 100 MB và việc proxy có thể làm đứt SSE. App tự có HTTPS rồi.

## Sau khi Live — kiểm tra 15 phút

- [ ] `https://ten-mien/api/health` là `{"ok":true}`
- [ ] `https://ten-mien/api/auth/session` là JSON, `user` là `null`. Với album thật, `demo` phải là `false`
- [ ] Đăng ký, đăng xuất, đăng nhập lại
- [ ] Tải một ảnh, restart service, ảnh vẫn mở được
- [ ] Cửa sổ ẩn danh mở thẳng URL `/api/files/...` thì không xem được ảnh
- [ ] `NODE_ENV` đang là `production` (cookie `Secure`)
- [ ] `ALLOW_DEMO` đúng với quyết định ở đầu tài liệu
- [ ] Chỉ một instance

## Vận hành

### Xem app còn sống không

`GET /api/health` chạy `SELECT 1` lên SQLite. Hỏng database thì 503 và một dòng log `HEALTH database unavailable`. Render gọi path này theo health check.

Thêm một máy bên ngoài, miễn phí: tài khoản [UptimeRobot](https://uptimerobot.com) (hoặc tương đương), monitor HTTPS mỗi 5 phút tới `https://ten-mien/api/health`, keyword `ok`. Báo qua email khi fail. Health check của chính Render không gửi email cho bạn theo cách một monitor ngoài làm.

Free tier ngủ sau 15 phút: monitor sẽ đánh thức nó liên tục và đốt 750 giờ miễn phí. Một lý do nữa để không ở gói Free.

### Log và lỗi

App không gắn Sentry. Lỗi không lường trước in ra stdout kèm mã `ref` 8 ký tự hex (`server/app.js`). Người dùng thấy cùng mã đó trên giao diện. Cách xử lý:

1. Họ đọc mã, ví dụ `1f9e2221`.
2. Render → service → **Logs**, tìm `SERVER 1f9e2221`.
3. Dòng tiếp theo là stack trace. Log có che đoạn token dài trên URL.

Log này mất khi Render xoay vòng bộ đệm. Với đồ án, vậy là đủ. Khi có người dùng thật, mới cần dịch vụ giữ log (Better Stack, Axiom, …) hoặc Sentry — phải tự thêm, repo chưa có.

### Sao lưu

Render chụp snapshot đĩa hằng ngày (theo tài liệu Persistent Disks của họ). Đó là lưới an toàn, không phải bản bạn tự cầm được.

Trên **Shell** của service (một máy khác, **không** thấy đĩa — Render nói rõ one-off job không gắn disk): đừng backup từ Shell kiểu đó.

Cách trong repo, chạy nơi **thấy** `DATA_DIR` (máy local có bản copy, hoặc lệnh trong tiến trình đang gắn đĩa nếu dashboard cho shell vào đúng instance):

```bash
npm run admin -- backup
```

Lệnh dùng `VACUUM INTO` để copy SQLite đang mở, rồi chép `uploads/`. Mặc định ghi vào `DATA_DIR/backups`. Tải bản đó ra khỏi Render (máy bạn hoặc một bucket) ít nhất mỗi tuần. Một snapshot chỉ nằm trên cùng đĩa với dữ liệu gốc thì cháy đĩa là mất cả hai.

Khôi phục: dừng service, thay `memorylane.db` và thư mục `uploads/` bằng bản backup, chạy lại, mở `/api/health`, rồi `npm run admin -- check-files`.

Các lệnh admin khác (`stats`, `users`, `reset-password`, `check-files`) nằm ở `server/admin.js`. Chúng không phải URL. Ai có quyền Shell trên Render thì đặt lại được mật khẩu — đừng chia sẻ tài khoản Render.

Chưa có "quên mật khẩu" qua email. Người mất mật khẩu cần bạn chạy `npm run admin -- reset-password <email>` và đưa mật khẩu tạm cho họ qua một kênh khác.

### Cập nhật dependency

Đã thêm `.github/dependabot.yml`: mỗi tuần GitHub mở pull request khi npm có bản mới. Với mỗi PR:

1. Đọc changelog của gói, nhất là `express` và `multer`.
2. Để CI chạy `npm ci`, `npm test`, `npm run build` (workflow `.github/workflows/ci.yml`).
3. Trên máy: `npm audit`. Lần cài trên Node 22 sau khi khoá dependency: **0 lỗ hổng** đã biết. Con số này đổi khi registry đổi, hãy chạy lại chứ đừng nhớ mãi.
4. Merge khi CI xanh. Render tự deploy.

Đừng `npm audit fix --force` cho có. Lệnh đó có thể nhảy bản major và làm vỡ Express 5.

### Nâng cấp app

1. Backup.
2. Push lên `main`.
3. Xem log đến dòng `Memory Lane API` và health xanh.
4. Nếu migration SQL mới bị lỗi, service không nghe cổng. Sửa, hoặc khôi phục backup. Đừng chạy hai bản đè lên cùng một file db.

## Checklist bảo mật, bám đúng code đang có

### Bí mật

- [ ] `.env` không nằm trong git. `.gitignore` bỏ `.env` và `.env.*`, nhưng giữ `.env.example`.
- [ ] Không có Client secret, API key, mật khẩu thật trong repo hay lịch sử git. Các chuỗi `GOCSPX-...` trong `test/google.test.js` là dữ liệu giả của bài test.
- [ ] `GOOGLE_CLIENT_SECRET` chỉ ở Environment của Render và trong `.env` trên máy bạn.
- [ ] Nếu một ngày secret lỡ bị commit: xoá file chưa đủ. Vào Google Cloud **xoay** Client secret, đặt giá trị mới trên Render, rồi mới dọn git history.
- [ ] `npm run setup:google` chỉ ghi `.env` local. Đừng chạy nó trên server production để "cho tiện" rồi copy file lên git.

### Phiên đăng nhập

- [ ] `NODE_ENV=production` để cookie có `Secure` (`server/lib/sessions.js`).
- [ ] Cookie là `HttpOnly` và `SameSite=Lax`. JavaScript trong `client/src/api.js` không đọc token.
- [ ] Database chỉ có SHA-256 của token. Lộ file db không đăng nhập hộ được.
- [ ] `SESSION_DAYS` bạn chấp nhận được (mặc định 30). Rút ngắn nếu máy dùng chung.
- [ ] Đổi mật khẩu đã xoá mọi session (`revokeAll`). Người dùng cũng có nút đăng xuất mọi nơi trong Cài đặt.
- [ ] Chưa có xác minh email. Ai cũng đăng ký được nếu họ biết URL. Với album gia đình, chấp nhận được khi bạn không quảng cáo URL. Muốn chặt hơn thì phải tự viết tính năng này — repo chưa có.

### Dữ liệu vào

- [ ] Mọi field đi qua `server/lib/validate.js` và trần trong `shared/limits.js`.
- [ ] SQL dùng tham số `?`, không ghép chuỗi từ người dùng.
- [ ] React hiện chữ người dùng gõ. Không có `dangerouslySetInnerHTML` trong `client/`.
- [ ] Link phim/nhạc chỉ `http`/`https`.
- [ ] Upload: `multer` giới hạn kích thước, nhận diện bằng magic bytes (`server/lib/files.js`), tên file ngẫu nhiên, không nằm trong thư mục public.
- [ ] `express.json` giới hạn body 100 KB. Ảnh đi đường multipart, không đi đường JSON.
- [ ] GPS/EXIF bị xoá trên server (`server/lib/metadata.js`) kể cả khi trình duyệt bỏ qua bước canvas.
- [ ] `?next=` của Google chỉ được là đường dẫn trong app (`server/routes/google.js`, hàm `safeNext`).

### Rate limit, CORS, header

- [ ] Đăng nhập, đăng ký, Google, xem trước lời mời có rate limit trong RAM (`AUTH_RATE_LIMIT`, cửa sổ 15 phút). Restart là đếm lại. Một instance thì ổn.
- [ ] `POST /api/auth/demo` **không** có rate limit. Tắt demo thì route này trả 404.
- [ ] Không có gói `cors`. Giữ vậy. Thêm `Access-Control-Allow-Origin: *` sẽ phá mô hình cookie.
- [ ] Header đã có: CSP (script/font chỉ từ chính server), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Permissions-Policy` tắt camera/mic/GPS, HSTS khi production (`server/lib/security.js`).
- [ ] Ghi chéo site bị chặn bằng `Sec-Fetch-Site` cộng `SameSite=Lax`.
- [ ] `trust proxy` chỉ bật khi production, để `req.ip` của rate limit là IP người dùng chứ không phải IP proxy Render.

### Quyền xem

- [ ] Query kỷ niệm, file, kỷ vật đều kiểm tra chủ hoặc người được share. Người lạ nhận 404, không phải 403.
- [ ] Kỷ vật chỉ chủ thấy, kể cả khi kỷ niệm đã share.
- [ ] Link mời: token dài, chỉ lưu băm, một lần, hết hạn, thu hồi được, có trần tạo mới mỗi ngày trong `server/routes/invites.js`.
- [ ] Xoá tài khoản đòi gõ lại email (`server/routes/me.js`) rồi cascade.

### Những việc app chưa làm — đừng tưởng là đã có

- Quên mật khẩu qua email, xác minh email.
- Rate limit cho đường upload (chỉ có trần `STORAGE_MB` mỗi tài khoản).
- Khoá tài khoản sau nhiều lần sai mật khẩu (có rate limit theo IP, không khoá từng email).
- Kiểm chữ ký JWT của Google lần nữa. Code đổi code lấy token qua HTTPS rồi kiểm issuer, audience, exp, nonce, email đã xác minh. Đủ theo cách tác giả chọn; đừng tự xoá các kiểm tra đó.
- Giám sát lỗi kiểu Sentry, cảnh báo uptime (bạn tự gắn, mục Log ở trên).
- Chống virus file upload. Magic bytes chặn file không phải ảnh/video, không phải phần mềm diệt virus.
- Mã hoá riêng file ảnh lúc nằm trên đĩa. Đĩa Render mã hoá at rest theo tài liệu của họ; ai có Shell vẫn đọc được file.

## Việc chặn hoặc làm nguy hiểm lúc deploy

Những mục đã kiểm trên repo. Mục "đã vá trong PR" là sửa nhỏ, không đổi hành vi app.

| Mức | Việc | Việc cần làm |
| --- | --- | --- |
| Chặn nếu làm sai | Deploy `client/dist` như site tĩnh | Dùng Web Service Node, start `npm start` |
| Chặn dữ liệu thật | Gói Free, không có đĩa | Gói `starter` + disk, `DATA_DIR=/var/data`, thử restart còn ảnh |
| Chặn dữ liệu thật | Nhiều instance hoặc autoscale | Giữ 1 instance |
| Nguy hiểm nếu quên | `ALLOW_DEMO` mặc định `true`, và `render.yaml` đang để `true` + `start:demo` | Album gia đình: `false` và `npm start` |
| Nguy hiểm nếu quên | Không đặt `NODE_ENV=production` | Cookie không `Secure`, không HSTS, rate limit nhìn nhầm IP |
| Không phải sự cố | Không có secret thật trong cây nguồn hay `git log` | Không phải xoay khoá hôm nay. Vẫn đừng commit `.env` |
| Đã vá trong PR | `.gitignore` trước đây chỉ có `.env`, nên `.env.local` hoặc `.env.production` vẫn có thể bị commit. Cũng chưa bỏ `*.db` nếu lỡ tạo database ngoài thư mục `data/` | Đã thêm `.env.*` (trừ `.env.example`), `*.db`, `*.sqlite`, `.vite/`, `coverage/` |
| Đã vá trong PR | `AUTH_RATE_LIMIT` có trong code nhưng không có trong `.env.example` | Đã thêm tên biến và giá trị mặc định `20` |
| Đã vá trong PR | Không có Dependabot | Đã thêm `.github/dependabot.yml` |
| Không chặn | `npm audit` lúc cài: 0 lỗ hổng. CI đã có `npm test` và `npm run build` | Chạy lại khi Dependabot mở PR |
| Không chặn | `server/seed-media/` khoảng 34 MB được commit có chủ ý. File lớn nhất khoảng 6 MB, dưới trần 100 MB của GitHub | Đừng thêm video gốc điện thoại vào git |
| Không chặn | `node:sqlite` in cảnh báo Experimental khi test | Node 22 và 24 đều chạy được. Hosting để Node 24 |
| Nên biết | Chưa có email reset mật khẩu | Dùng `npm run admin -- reset-password` |
| Nên biết | `start:demo` mỗi lần bật máy sẽ dựng lại user demo | User thật không bị xoá. Ảnh ai đó lỡ tải vào tài khoản demo sẽ mất ở lần khởi động sau, và trong lúc server đang chạy thì ai bấm nút demo cũng thấy |

Build và test đã chạy trên máy kiểm tra: `npm ci` thành công, `npm run build` ra `client/dist/`, `npm test` 72/72. Node trên máy kiểm tra là 22.23 (đủ `engines`). Production vẫn nên `NODE_VERSION=24`.
